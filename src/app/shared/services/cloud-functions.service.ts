export interface MainReturnType {
  message: string;
  success: boolean;
}

export interface StringDataReturnType extends MainReturnType {
  data: string | null;
}
