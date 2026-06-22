import { z } from 'zod';
import { FIELD_LIMITS } from '../../domain/constants';

const MAX_ROBOT_HEADS = 64;

const machineIdSchema = z.string().trim().min(1, "L'identifiant machine est obligatoire.").max(FIELD_LIMITS.MACHINE_ID).regex(/^[A-Za-z0-9\-_]+$/, "L'identifiant machine ne peut contenir que des lettres, chiffres, tirets et underscores.");
const brandSchema = z.string().trim().min(1, 'La marque est obligatoire.').max(FIELD_LIMITS.BRAND);
const robotNumberSchema = (msg: string) => z.string().trim().min(1, msg).max(FIELD_LIMITS.ROBOT);
const robotHeadsSchema = z.coerce.number().int().min(1, 'Le nombre de têtes du robot doit être positif.').max(MAX_ROBOT_HEADS, `Le nombre de têtes ne peut pas dépasser ${MAX_ROBOT_HEADS}.`);

const singleRobotMachineSchema = z.object({
  machineId: machineIdSchema,
  brand: brandSchema,
  hasDoubleRobot: z.literal(false),
  robotNumber: robotNumberSchema('Le numéro du robot est obligatoire.'),
  robotHeads: robotHeadsSchema,
});

const doubleRobotMachineSchema = z.object({
  machineId: machineIdSchema,
  brand: brandSchema,
  hasDoubleRobot: z.literal(true),
  leftRobotNumber: robotNumberSchema('Le numéro du robot gauche est obligatoire.'),
  leftRobotHeads: robotHeadsSchema,
  rightRobotNumber: robotNumberSchema('Le numéro du robot droit est obligatoire.'),
  rightRobotHeads: robotHeadsSchema,
});

export const lineMachineSchema = z.discriminatedUnion('hasDoubleRobot', [
  singleRobotMachineSchema,
  doubleRobotMachineSchema,
]);

export const createLineSchema = z.object({
  lineNumber: z.string().trim().min(1, 'Le numéro de ligne est obligatoire.').max(FIELD_LIMITS.LINE_NUMBER),
  isActive: z.boolean().optional(),
  machines: z
    .array(lineMachineSchema)
    .min(1, 'Ajoutez au moins une machine.')
    .max(10, 'Une ligne ne peut pas dépasser 10 machines.'),
});

export const updateLineSchema = createLineSchema.partial();

export type CreateLineInput = z.infer<typeof createLineSchema>;
export type UpdateLineInput = z.infer<typeof updateLineSchema>;
