export interface SingleRobotMachine {
  machineId: string;
  brand: string;
  hasDoubleRobot: false;
  robotNumber: string;
  robotHeads: number;
}

export interface DoubleRobotMachine {
  machineId: string;
  brand: string;
  hasDoubleRobot: true;
  leftRobotNumber: string;
  leftRobotHeads: number;
  rightRobotNumber: string;
  rightRobotHeads: number;
}

export type LineMachine = SingleRobotMachine | DoubleRobotMachine;

export interface ProductionLine {
  id: number;
  line_number: string;
  machines: LineMachine[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
