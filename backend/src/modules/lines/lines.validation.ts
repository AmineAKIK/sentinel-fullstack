import { z } from 'zod';
import { FIELD_LIMITS } from '../../domain/constants';
import { numericIdentifierSchema } from '../../domain/identifiers';

const MAX_ROBOT_HEADS = 64;

export const lineNumberSchema = numericIdentifierSchema({
  label: 'Le numéro de ligne',
  min: 1,
  max: FIELD_LIMITS.LINE_NUMBER,
});

const machineIdSchema = z
  .string()
  .trim()
  .min(1, "L'identifiant machine est obligatoire.")
  .max(FIELD_LIMITS.MACHINE_ID)
  .regex(
    /^[A-Za-z0-9\-_]+$/,
    "L'identifiant machine ne peut contenir que des lettres, chiffres, tirets et underscores."
  );
const brandSchema = z.string().trim().min(1, 'La marque est obligatoire.').max(FIELD_LIMITS.BRAND);
const robotNumberSchema = (msg: string) => z.string().trim().min(1, msg).max(FIELD_LIMITS.ROBOT);
const robotHeadsSchema = z.coerce
  .number()
  .int()
  .min(1, 'Le nombre de têtes du robot doit être positif.')
  .max(MAX_ROBOT_HEADS, `Le nombre de têtes ne peut pas dépasser ${MAX_ROBOT_HEADS}.`);

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

const lineFieldsSchema = z.object({
  lineNumber: lineNumberSchema,
  isActive: z.boolean().optional(),
  machines: z
    .array(lineMachineSchema)
    .min(1, 'Ajoutez au moins une machine.')
    .max(10, 'Une ligne ne peut pas dépasser 10 machines.'),
});

function requireUniqueMachineIds(
  machines: z.infer<typeof lineMachineSchema>[] | undefined,
  context: z.RefinementCtx
): void {
  if (!machines) return;
  const seen = new Set<string>();
  machines.forEach((machine, index) => {
    const normalized = machine.machineId.trim().toLowerCase();
    if (seen.has(normalized)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['machines', index, 'machineId'],
        message: 'Chaque identifiant machine doit être unique dans la ligne.',
      });
    }
    seen.add(normalized);
  });
}

export const createLineSchema = lineFieldsSchema.superRefine((value, context) => {
  requireUniqueMachineIds(value.machines, context);
});

export const updateLineSchema = lineFieldsSchema.partial().superRefine((value, context) => {
  requireUniqueMachineIds(value.machines, context);
});

export const checkLineConflictsSchema = z.object({
  lineNumber: lineNumberSchema,
  machineIds: z
    .array(machineIdSchema)
    .max(10, 'Une ligne ne peut pas dépasser 10 machines.')
    .default([]),
  lineId: z.coerce.number().int().positive().safe().optional(),
});

export type CreateLineInput = z.infer<typeof createLineSchema>;
export type UpdateLineInput = z.infer<typeof updateLineSchema>;
