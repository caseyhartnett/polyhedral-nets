export const JOHNSON_SOLID_IDS = [
  "j1",
  "j2",
  "j3",
  "j4",
  "j5",
  "j6",
  "j7",
  "j8",
  "j9",
  "j10",
  "j11",
  "j12",
  "j13",
  "j14",
  "j15",
  "j16",
  "j17",
  "j18",
  "j19",
  "j20",
  "j21",
  "j22",
  "j23",
  "j24",
  "j25",
  "j26",
  "j27",
  "j28",
  "j29",
  "j30",
  "j31",
  "j32",
  "j33",
  "j34",
  "j35",
  "j36",
  "j37",
  "j38",
  "j39",
  "j40",
  "j41",
  "j42",
  "j43",
  "j44",
  "j45",
  "j46",
  "j47",
  "j48",
  "j49",
  "j50",
  "j51",
  "j52",
  "j53",
  "j54",
  "j55",
  "j56",
  "j57",
  "j58",
  "j59",
  "j60",
  "j61",
  "j62",
  "j63",
  "j64",
  "j65",
  "j66",
  "j67",
  "j68",
  "j69",
  "j70",
  "j71",
  "j72",
  "j73",
  "j74",
  "j75",
  "j76",
  "j77",
  "j78",
  "j79",
  "j80",
  "j81",
  "j82",
  "j83",
  "j84",
  "j85",
  "j86",
  "j87",
  "j88",
  "j89",
  "j90",
  "j91",
  "j92"
] as const;

export type JohnsonSolidId = (typeof JOHNSON_SOLID_IDS)[number];

export type JohnsonSolidFamily =
  | "pyramid"
  | "cupola_rotunda"
  | "prism_modification"
  | "platonic_modification"
  | "archimedean_modification"
  | "rhombicosidodecahedron_modification"
  | "elementary";

export interface JohnsonSolidCatalogEntry {
  id: JohnsonSolidId;
  index: number;
  name: string;
  family: JohnsonSolidFamily;
}

const JOHNSON_SOLID_NAMES = [
  "square pyramid",
  "pentagonal pyramid",
  "triangular cupola",
  "square cupola",
  "pentagonal cupola",
  "pentagonal rotunda",
  "elongated triangular pyramid",
  "elongated square pyramid",
  "elongated pentagonal pyramid",
  "gyroelongated square pyramid",
  "gyroelongated pentagonal pyramid",
  "triangular dipyramid",
  "pentagonal dipyramid",
  "elongated triangular dipyramid",
  "elongated square dipyramid",
  "elongated pentagonal dipyramid",
  "gyroelongated square dipyramid",
  "elongated triangular cupola",
  "elongated square cupola",
  "elongated pentagonal cupola",
  "elongated pentagonal rotunda",
  "gyroelongated triangular cupola",
  "gyroelongated square cupola",
  "gyroelongated pentagonal cupola",
  "gyroelongated pentagonal rotunda",
  "gyrobifastigium",
  "triangular orthobicupola",
  "square orthobicupola",
  "square gyrobicupola",
  "pentagonal orthobicupola",
  "pentagonal gyrobicupola",
  "pentagonal orthocupolarotunda",
  "pentagonal gyrocupolarotunda",
  "pentagonal orthobirotunda",
  "elongated triangular orthobicupola",
  "elongated triangular gyrobicupola",
  "elongated square gyrobicupola",
  "elongated pentagonal orthobicupola",
  "elongated pentagonal gyrobicupola",
  "elongated pentagonal orthocupolarotunda",
  "elongated pentagonal gyrocupolarotunda",
  "elongated pentagonal orthobirotunda",
  "elongated pentagonal gyrobirotunda",
  "gyroelongated triangular bicupola",
  "gyroelongated square bicupola",
  "gyroelongated pentagonal bicupola",
  "gyroelongated pentagonal cupolarotunda",
  "gyroelongated pentagonal birotunda",
  "augmented triangular prism",
  "biaugmented triangular prism",
  "triaugmented triangular prism",
  "augmented pentagonal prism",
  "biaugmented pentagonal prism",
  "augmented hexagonal prism",
  "parabiaugmented hexagonal prism",
  "metabiaugmented hexagonal prism",
  "triaugmented hexagonal prism",
  "augmented dodecahedron",
  "parabiaugmented dodecahedron",
  "metabiaugmented dodecahedron",
  "triaugmented dodecahedron",
  "metabidiminished icosahedron",
  "tridiminished icosahedron",
  "augmented tridiminished icosahedron",
  "augmented truncated tetrahedron",
  "augmented truncated cube",
  "biaugmented truncated cube",
  "augmented truncated dodecahedron",
  "parabiaugmented truncated dodecahedron",
  "metabiaugmented truncated dodecahedron",
  "triaugmented truncated dodecahedron",
  "gyrate rhombicosidodecahedron",
  "parabigyrate rhombicosidodecahedron",
  "metabigyrate rhombicosidodecahedron",
  "trigyrate rhombicosidodecahedron",
  "diminished rhombicosidodecahedron",
  "paragyrate diminished rhombicosidodecahedron",
  "metagyrate diminished rhombicosidodecahedron",
  "bigyrate diminished rhombicosidodecahedron",
  "parabidiminished rhombicosidodecahedron",
  "metabidiminished rhombicosidodecahedron",
  "gyrate bidiminished rhombicosidodecahedron",
  "tridiminished rhombicosidodecahedron",
  "snub disphenoid",
  "snub square antiprism",
  "sphenocorona",
  "augmented sphenocorona",
  "sphenomegacorona",
  "hebesphenomegacorona",
  "disphenocingulum",
  "bilunabirotunda",
  "triangular hebesphenorotunda"
] as const;

function familyFromIndex(index: number): JohnsonSolidFamily {
  if (index <= 2) {
    return "pyramid";
  }
  if (index <= 48) {
    return "cupola_rotunda";
  }
  if (index <= 57) {
    return "prism_modification";
  }
  if (index <= 64) {
    return "platonic_modification";
  }
  if (index <= 71) {
    return "archimedean_modification";
  }
  if (index <= 83) {
    return "rhombicosidodecahedron_modification";
  }
  return "elementary";
}

export const JOHNSON_SOLID_CATALOG: JohnsonSolidCatalogEntry[] = JOHNSON_SOLID_NAMES.map(
  (name, index): JohnsonSolidCatalogEntry => ({
    id: `j${index + 1}` as JohnsonSolidId,
    index: index + 1,
    name,
    family: familyFromIndex(index + 1)
  })
);

export function getJohnsonSolidById(id: JohnsonSolidId): JohnsonSolidCatalogEntry | undefined {
  return JOHNSON_SOLID_CATALOG.find((entry) => entry.id === id);
}
