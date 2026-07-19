import { LineMachine } from '../types';
import { isDigitsOnly } from './identifiers';

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

  const lineNumber = form.lineNumber.trim();
  if (!lineNumber) issues.push('Le numéro de ligne est obligatoire.');
  else if (!isDigitsOnly(lineNumber)) {
    issues.push('Le numéro de ligne doit contenir uniquement des chiffres.');
  }
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
  const duplicate = machines.some(
    (item, index) => index !== machineIndex && item.machineId.trim().toLowerCase() === normalizedId
  );
  if (duplicate) issues.push("L'ID machine existe déjà sur cette ligne.");
  return issues.map((issue) => issue.replace(/^Machine : /, ''));
}

/**
 * Égalité métier entre deux machines, après normalisation (trim des chaînes).
 * Compare uniquement les champs significatifs du mode actif (simple ou double
 * robot), pas les champs résiduels de l'autre mode — contrairement à un
 * `JSON.stringify` naïf. Source unique de la détection « a-t-on changé quelque
 * chose ? » pour les écrans d'édition machine.
 */
export function lineMachineEquals(a: LineMachine, b: LineMachine): boolean {
  const na = normalizeLineMachine(a);
  const nb = normalizeLineMachine(b);

  if (na.machineId !== nb.machineId) return false;
  if (na.brand !== nb.brand) return false;
  if (na.hasDoubleRobot !== nb.hasDoubleRobot) return false;

  if (na.hasDoubleRobot && nb.hasDoubleRobot) {
    return (
      na.leftRobotNumber === nb.leftRobotNumber &&
      na.leftRobotHeads === nb.leftRobotHeads &&
      na.rightRobotNumber === nb.rightRobotNumber &&
      na.rightRobotHeads === nb.rightRobotHeads
    );
  }

  if (!na.hasDoubleRobot && !nb.hasDoubleRobot) {
    return na.robotNumber === nb.robotNumber && na.robotHeads === nb.robotHeads;
  }

  return false;
}

/** Égalité métier entre deux listes de machines (ordre significatif). */
export function lineMachinesEqual(a: LineMachine[], b: LineMachine[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((machine, index) => lineMachineEquals(machine, b[index]));
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
