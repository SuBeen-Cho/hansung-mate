import type { PersonalRecord } from "@hansung/academic-engine";
import { createContext, useContext } from "react";
import { demoOtherCredits, demoRecords } from "./model";
export const initialRecords: PersonalRecord[] = [
  ...demoRecords,
  ...demoOtherCredits.map((r) => ({ ...r, grade: "P" })),
].map((r) => ({ ...r, origin: "DEMO", recognition: "UNVERIFIED" }));

import type { AcademicData } from "./academic-data-model";

export type { AcademicData } from "./academic-data-model";
export { validAcademicData } from "./academic-data-model";
export const defaultAcademicData: AcademicData = {
  records: initialRecords,
  revision: 1,
  creditLimit: 18,
};
export const AcademicDataContext = createContext(defaultAcademicData);
export const useAcademicData = () => useContext(AcademicDataContext);
