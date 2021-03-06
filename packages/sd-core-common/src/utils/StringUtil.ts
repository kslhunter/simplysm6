export class StringUtil {
  public static getSuffix(text: string, type: "을" | "은" | "이" | "와" | "랑" | "로" | "라"): string {
    const table = {
      "을": { t: "을", f: "를" },
      "은": { t: "은", f: "는" },
      "이": { t: "이", f: "가" },
      "와": { t: "과", f: "와" },
      "랑": { t: "이랑", f: "랑" },
      "로": { t: "으로", f: "로" },
      "라": { t: "이라", f: "라" }
    };

    // 받침존재여부
    const hasLast = ((text.slice(-1).charCodeAt(0) - 0xAC00) % 28) !== 0;
    return hasLast ? table[type].t : table[type].f;
  }

  public static toPascalCase(str: string): string {
    return str
      .replace(/[-_][a-z]/g, (m) => m[1].toUpperCase())
      .replace(/^[a-z]/, (m) => m.toUpperCase());
  }

  public static toCamelCase(str: string): string {
    return str
      .replace(/[-_][a-z]/g, (m) => m[1].toUpperCase())
      .replace(/^[A-Z]/, (m) => m.toLowerCase());
  }

  public static toKebabCase(str: string): string {
    return str
      .replace(/^[A-Z]/, (m) => m.toLowerCase())
      .replace(/[-_]?[A-Z]/g, (m) => "-" + m.toLowerCase());
  }

  public static isNullOrEmpty(str: string | null | undefined): str is ("" | undefined | null) {
    return str == null || str === "";
  }
}
