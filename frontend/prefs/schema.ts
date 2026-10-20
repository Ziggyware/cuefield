import { GROUPS_A } from "./groups-a.ts";
import { GROUPS_B } from "./groups-b.ts";
import type { Group } from "./defs.ts";

export type { Control, Def, Group } from "./defs.ts";

export const GROUPS: Group[] = [...GROUPS_A, ...GROUPS_B];
