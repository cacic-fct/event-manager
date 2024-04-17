export class GlobalConstantsService {
  public static appName: string = 'FCT App';
  /* Versioning convention:
    YYYY.MM.DD.HH.MM(.rev)

    rev is optional. It's used in case of very minor changes that require a new release
    (e.g. a typo in a string).
  */
  public static appVersion: string = '2024.04.17.03.42';
  public static userDataVersion: string = '0.3.0';
  public static nonAmbiguousAlphabetCapitalizedNumbers: string = '2345689ABCDEFGHKMNPQRSTWXYZ';
}
