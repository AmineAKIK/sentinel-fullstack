import { z } from 'zod';

const singleRobotMachineSchema = z.object({
  machineId: z.string().trim().min(1, "L'identifiant machine est obligatoire."),
  brand: z.string().trim().min(1, 'La marque est obligatoire.'),
  hasDoubleRobot: z.literal(false),
  robotNumber: z.string().trim().min(1, 'Le numéro du robot est obligatoire.'),
  robotHeads: z.coerce.number().int().min(1, 'Le nombre de têtes du robot doit être positif.'),
});

const doubleRobotMachineSchema = z.object({
  machineId: z.string().trim().min(1, "L'identifiant machine est obligatoire."),
  brand: z.string().trim().min(1, 'La marque est obligatoire.'),
  hasDoubleRobot: z.literal(true),
  leftRobotNumber: z.string().trim().min(1, 'Le numéro du robot gauche est obligatoire.'),
  leftRobotHeads: z.coerce.number().int().min(1, 'Le nombre de têtes gauche doit être positif.'),
  rightRobotNumber: z.string().trim().min(1, 'Le numéro du robot droit est obligatoire.'),
  rightRobotHeads: z.coerce.number().int().min(1, 'Le nombre de têtes droit doit être positif.'),
});

export const lineMachineSchema = z.discriminatedUnion('hasDoubleRobot', [
  singleRobotMachineSchema,
  doubleRobotMachineSchema,
]);

export const createLineSchema = z.object({
  lineNumber: z.string().trim().min(1, 'Le numéro de ligne est obligatoire.').max(40),
  isActive: z.boolean().optional(),
  machines: z
    .array(lineMachineSchema)
    .min(1, 'Ajoutez au moins une machine.')
    .max(10, 'Une ligne ne peut pas dépasser 10 machines.'),
});

export const updateLineSchema = createLineSchema.partial();

export type CreateLineInput = z.infer<typeof createLineSchema>;
export type UpdateLineInput = z.infer<typeof updateLineSchema>;
