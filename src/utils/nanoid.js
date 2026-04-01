import { nanoid } from "nanoid";

export function customNanoid(size = 10) {
  return nanoid(size);
}
