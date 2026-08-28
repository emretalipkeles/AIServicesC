/**
 * This is deliberately a data-only allow-list. Supporting a future ERMHDR
 * version requires adding one value here, never changing parser behavior.
 *
 * P6 exports in the supplied real fixture identify their ERMHDR build as
 * 20.12, while the project tracks the v.124-v.135 export families too.
 */
export const SUPPORTED_XER_ERMHDR_VERSIONS: readonly string[] = [
  "v.124", "v.125", "v.126", "v.127", "v.128", "v.129",
  "v.130", "v.131", "v.132", "v.133", "v.134", "v.135",
  "20.12",
];

export const supportedXerVersions = new Set(SUPPORTED_XER_ERMHDR_VERSIONS);
