export interface MainReturnType {
  message: string;
  success: boolean;
  data?: any;
}

export interface StringDataReturnType extends MainReturnType {
  data: string | null;
}
