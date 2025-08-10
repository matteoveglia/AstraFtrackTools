export interface StatusFilter { ids?: string[]; names?: string[] }
export interface UserFilter { ids?: string[]; usernames?: string[] }
export interface DateFilter { kind: "older" | "newer" | "between"; from?: string; to?: string }
export interface CustomAttrFilter { key: string; op: "eq" | "neq" | "contains" | "true" | "false"; value?: string | number | boolean }

/**
 * FilterService builds ftrack where-clauses from structured filters
 */
export class FilterService {
  buildWhere(
    { status, user, date, custom }: { status?: StatusFilter; user?: UserFilter; date?: DateFilter; custom?: CustomAttrFilter[] },
  ): string {
    const clauses: string[] = [];

    if (status?.ids?.length) {
      clauses.push(`status.id in ("${status.ids.join("",)}")`);
    } else if (status?.names?.length) {
      const names = status.names.map((n) => `"${n}"`).join(", ");
      clauses.push(`status.name in (${names})`);
    }

    if (user?.ids?.length) {
      clauses.push(`user.id in ("${user.ids.join("",)}")`);
    } else if (user?.usernames?.length) {
      const unames = user.usernames.map((u) => `"${u}"`).join(", ");
      clauses.push(`user.username in (${unames})`);
    }

    if (date) {
      if (date.kind === "older" && date.to) {
        clauses.push(`date < "${date.to}"`);
      } else if (date.kind === "newer" && date.from) {
        clauses.push(`date >= "${date.from}"`);
      } else if (date.kind === "between" && date.from && date.to) {
        clauses.push(`date >= "${date.from}" and date <= "${date.to}"`);
      }
    }

    if (custom?.length) {
      for (const f of custom) {
        switch (f.op) {
          case "true":
            clauses.push(`custom_attributes any (key is "${f.key}" and value is true)`);
            break;
          case "false":
            clauses.push(`custom_attributes any (key is "${f.key}" and value is false)`);
            break;
          case "eq":
            clauses.push(`custom_attributes any (key is "${f.key}" and value is ${typeof f.value === "string" ? `"${f.value}"` : f.value})`);
            break;
          case "neq":
            clauses.push(`not (custom_attributes any (key is "${f.key}" and value is ${typeof f.value === "string" ? `"${f.value}"` : f.value}))`);
            break;
          case "contains":
            clauses.push(`custom_attributes any (key is "${f.key}" and value like "%${f.value}%")`);
            break;
        }
      }
    }

    return clauses.length ? clauses.join(" and ") : "";
  }
}