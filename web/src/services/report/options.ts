interface StageOption {
  parts: boolean;
  finTemplates: boolean;
}

export interface ReportOptions {
  designReport: boolean;
  includeMotors: boolean;
  showByStage: boolean;
  noseTemplates: boolean;
  transitionTemplates: boolean;
  finMarkingGuide: boolean;
  stages: StageOption[];
  paper: 'letter' | 'a4';
  orientation: 'portrait' | 'landscape';
  /** Hex, or '' for outline only. */
  templateFill: string;
  templateStroke: string;
}
