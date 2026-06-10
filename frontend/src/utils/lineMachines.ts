import { LineMachine } from '../types';

export interface LineMachineFormData {
  lineNumber: string;
  machines: LineMachine[];
}

export function emptyMachine(): LineMachine {
  return {
    machineId: '',
    brand: '',
    hasDoubleRobot: false,
    robotNumber: '',
    robotHeads: 0,
  };
}

export function switchMachineRobotMode(machine: LineMachine, hasDoubleRobot: boolean): LineMachine {
  if (hasDoubleRobot) {
    return {
      machineId: machine.machineId,
      brand: machine.brand,
      hasDoubleRobot: true,
      leftRobotNumber: '',
      leftRobotHeads: 0,
      rightRobotNumber: '',
      rightRobotHeads: 0,
    };
  }

  return {
    machineId: machine.machineId,
    brand: machine.brand,
    hasDoubleRobot: false,
    robotNumber: '',
    robotHeads: 0,
  };
}

export function normalizeLineMachine(machine: LineMachine): LineMachine {
  if (machine.hasDoubleRobot) {
    return {
      ...machine,
      machineId: machine.machineId.trim(),
      brand: machine.brand.trim(),
      leftRobotNumber: machine.leftRobotNumber.trim(),
      rightRobotNumber: machine.rightRobotNumber.trim(),
    };
  }

  return {
    ...machine,
    machineId: machine.machineId.trim(),
    brand: machine.brand.trim(),
    robotNumber: machine.robotNumber.trim(),
    robotHeads: machine.robotHeads,
  };
}

export function validateMachine(machine: LineMachine, label = 'Machine'): string[] {
  const issues: string[] = [];

  if (!machine.machineId.trim()) issues.push(`${label} : l'ID machine est obligatoire.`);
  if (!machine.brand.trim()) issues.push(`${label} : la marque est obligatoire.`);

  if (machine.hasDoubleRobot) {
    if (!machine.leftRobotNumber.trim()) issues.push(`${label} : le robot gauche est obligatoire.`);
    if (!machine.rightRobotNumber.trim()) issues.push(`${label} : le robot droit est obligatoire.`);
    if (machine.leftRobotHeads < 1 || machine.rightRobotHeads < 1) {
      issues.push(`${label} : le nombre de têtes doit être positif.`);
    }
  } else {
    if (!machine.robotNumber.trim()) issues.push(`${label} : le numéro de robot est obligatoire.`);
    if (machine.robotHeads < 1) issues.push(`${label} : le nombre de têtes doit être positif.`);
  }

  return issues;
}

export function validateLineForm(form: LineMachineFormData): string[] {
  const issues: string[] = [];

  if (!form.lineNumber.trim()) issues.push('Le numéro de ligne est obligatoire.');
  if (form.machines.length < 1) issues.push('Ajoutez au moins une machine.');
  if (form.machines.length > 10) issues.push('Une ligne ne peut pas dépasser 10 machines.');

  const seenIds = new Set<string>();
  form.machines.forEach((machine, index) => {
    const label = `Machine ${index + 1}`;
    issues.push(...validateMachine(machine, label));

    const normalizedId = machine.machineId.trim().toLowerCase();
    if (!normalizedId) return;
    if (seenIds.has(normalizedId)) {
      issues.push(`${label} : l'ID machine est déjà utilisé.`);
      return;
    }
    seenIds.add(normalizedId);
  });

  return issues;
}

export function validateMachineAgainstLine(
  machine: LineMachine,
  machines: LineMachine[],
  machineIndex: number
): string[] {
  const issues = validateMachine(machine, 'Machine');
  const normalizedId = machine.machineId.trim().toLowerCase();
  const duplicate = machines.some((item, index) =>
    index !== machineIndex && item.machineId.trim().toLowerCase() === normalizedId
  );
  if (duplicate) issues.push("L'ID machine existe déjà sur cette ligne.");
  return issues.map((issue) => issue.replace(/^Machine : /, ''));
}

export function machineRobotSummary(machine: LineMachine): string {
  return machine.hasDoubleRobot
    ? `Double robot · Gauche ${machine.leftRobotNumber} (${machine.leftRobotHeads} têtes) · Droite ${machine.rightRobotNumber} (${machine.rightRobotHeads} têtes)`
    : `Robot unique · ${machine.robotNumber} (${machine.robotHeads} têtes)`;
}

export function emptyToString(value: number | undefined): string {
  if (!value) return '';
  return String(value);
}

export interface RobotOption {
  label: string;
  heads: number;
}

export function getRobotOptions(machine: LineMachine): RobotOption[] {
  if (machine.hasDoubleRobot) {
    return [
      { label: `Gauche ${machine.leftRobotNumber}`, heads: machine.leftRobotHeads },
      { label: `Droite ${machine.rightRobotNumber}`, heads: machine.rightRobotHeads },
    ];
  }
  return [{ label: machine.robotNumber, heads: machine.robotHeads }];
}
