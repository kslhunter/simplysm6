import { Type } from "../types/Type";
import { WrappedType } from "../types/WrappedType";
import { NeverEntryError } from "../errors/NeverEntryError";
import { ObjectUtil } from "../utils/ObjectUtil";
import { DateOnly } from "../types/DateOnly";
import { DateTime } from "../types/DateTime";
import { Time } from "../types/Time";

declare global {
  interface Array<T> {
    single(predicate?: (item: T, index: number) => boolean): T | undefined;

    first(predicate?: (item: T, index: number) => boolean): T | undefined;

    filterAsync(predicate: (item: T, index: number) => Promise<boolean>): Promise<T[]>;

    last(predicate?: (item: T, index: number) => boolean): T | undefined;

    filterExists(): NonNullable<T>[];

    ofType<N extends T>(type: Type<WrappedType<N>>): N[];

    mapAsync<R>(selector: (item: T, index: number) => Promise<R>): Promise<R[]>;

    mapMany(): T;

    mapMany<R>(selector: (item: T, index: number) => R[]): R[];

    mapManyAsync<R>(selector: (item: T, index: number) => Promise<R[]>): Promise<R[]>;

    parallelAsync<R>(fn: (item: T, index: number) => Promise<R>): Promise<R[]>;

    groupBy<K>(keySelector: (item: T, index: number) => K): { key: K; values: T[] }[];

    groupBy<K, V>(keySelector: (item: T, index: number) => K, valueSelector: (item: T, index: number) => V): { key: K; values: V[] }[];

    toMap<K>(keySelector: (item: T, index: number) => K): Map<K, T>;

    toMap<K, V>(keySelector: (item: T, index: number) => K, valueSelector: (item: T, index: number) => V): Map<K, V>;

    toMapAsync<K>(keySelector: (item: T, index: number) => Promise<K>): Promise<Map<K, T>>;

    toMapAsync<K, V>(keySelector: (item: T, index: number) => Promise<K> | K, valueSelector: (item: T, index: number) => Promise<V> | V): Promise<Map<K, V>>;

    toObject(keySelector: (item: T, index: number) => string): Record<string, T>;

    toObject<V>(keySelector: (item: T, index: number) => string, valueSelector: (item: T, index: number) => V): Record<string, V>;

    distinct(matchAddress?: boolean): T[];

    distinctThis(matchAddress?: boolean): void;

    orderBy(selector?: (item: T) => string | number | DateOnly | DateTime | Time | undefined): T[];

    orderByDesc(selector?: (item: T) => string | number | DateOnly | DateTime | Time | undefined): T[];

    diffs<P>(target: P[], options?: { keys?: string[]; excludes?: string[] }): TArrayDiffsResult<T, P>[];

    oneWayDiffs<K extends keyof T>(orgItems: T[] | Map<T[K], T>, key: K, options?: { includeSame?: boolean; excludes?: string[] }): TArrayDiffs2Result<T>[];

    merge<P>(target: P[], options?: { keys?: string[]; excludes?: string[] }): (T | P | (T & P))[];

    sum(selector?: (item: T, index: number) => number): number;

    min(): T | undefined;

    min<P extends number | string>(selector?: (item: T, index: number) => P): P | undefined;

    max(): T | undefined;

    max<P extends number | string>(selector?: (item: T, index: number) => P): P | undefined;

    shuffle(): T[];

    insert(index: number, ...items: T[]): this;

    remove(item: T): this;

    remove(selector: (item: T, index: number) => boolean): this;

    clear(): this;
  }

  interface ReadonlyArray<T> {
    single(predicate?: (item: T, index: number) => boolean): T | undefined;

    first(predicate?: (item: T, index: number) => boolean): T | undefined;

    filterAsync(predicate: (item: T, index: number) => Promise<boolean>): Promise<T[]>;

    last(predicate?: (item: T, index: number) => boolean): T | undefined;

    filterExists(): NonNullable<T>[];

    ofType<N extends T>(type: Type<WrappedType<N>>): N[];

    mapAsync<R>(selector: (item: T, index: number) => Promise<R>): Promise<R[]>;

    mapMany(): T;

    mapMany<R>(selector: (item: T, index: number) => R[]): R[];

    mapManyAsync<R>(selector: (item: T, index: number) => Promise<R[]>): Promise<R[]>;

    parallelAsync<R>(fn: (item: T, index: number) => Promise<R>): Promise<R[]>;

    groupBy<K>(keySelector: (item: T, index: number) => K): { key: K; values: T[] }[];

    groupBy<K, V>(keySelector: (item: T, index: number) => K, valueSelector: (item: T, index: number) => V): { key: K; values: V[] }[];

    toMap<K>(keySelector: (item: T, index: number) => K): Map<K, T>;

    toMap<K, V>(keySelector: (item: T, index: number) => K, valueSelector: (item: T, index: number) => V): Map<K, V>;

    toMapAsync<K>(keySelector: (item: T, index: number) => Promise<K>): Promise<Map<K, T>>;

    toMapAsync<K, V>(keySelector: (item: T, index: number) => Promise<K> | K, valueSelector: (item: T, index: number) => Promise<V> | V): Promise<Map<K, V>>;

    toObject(keySelector: (item: T, index: number) => string): Record<string, T>;

    toObject<V>(keySelector: (item: T, index: number) => string, valueSelector: (item: T, index: number) => V): Record<string, V>;

    distinct(matchAddress?: boolean): T[];

    orderBy(selector?: (item: T) => string | number | DateOnly | DateTime | Time | undefined): T[];

    orderByDesc(selector?: (item: T) => string | number | DateOnly | DateTime | Time | undefined): T[];

    diffs<P>(target: P[], options?: { keys?: string[]; excludes?: string[] }): TArrayDiffsResult<T, P>[];

    oneWayDiffs<K extends keyof T>(orgItems: T[] | Map<T[K], T>, key: K, options?: { includeSame?: boolean; excludes?: string[] }): TArrayDiffs2Result<T>[];

    merge<P>(target: P[], options?: { keys?: string[]; excludes?: string[] }): (T | P | (T & P))[];

    sum(selector?: (item: T, index: number) => number): number;

    min(): T | undefined;

    min<P extends number | string>(selector?: (item: T, index: number) => P): P | undefined;

    max(): T | undefined;

    max<P extends number | string>(selector?: (item: T, index: number) => P): P | undefined;
  }
}

((prototype) => {
  prototype.single = function <T>(this: T[], predicate?: (item: T, index: number) => boolean): T | undefined {
    const arr = predicate !== undefined ? this.filter(predicate) : this;
    if (arr.length > 1) {
      throw new Error("????????? ???????????? ????????????. (" + arr.length + "???)");
    }
    return arr[0];
  };

  prototype.first = function <T>(this: T[], predicate?: (item: T, index: number) => boolean): T | undefined {
    return predicate !== undefined ? this.find(predicate) : this[0];
  };

  prototype.filterAsync = async function <T>(this: T[], predicate: (item: T, index: number) => Promise<boolean>): Promise<T[]> {
    const arr: T[] = [];
    for (let i = 0; i < this.length; i++) {
      if (await predicate(this[i], i)) {
        arr.push(this[i]);
      }
    }
    return arr;
  };

  prototype.last = function <T>(this: T[], predicate?: (item: T, index: number) => boolean): T | undefined {
    if (predicate !== undefined) {
      for (let i = this.length - 1; i >= 0; i--) {
        if (predicate(this[i], i)) {
          return this[i];
        }
      }

      return undefined;
    }
    else {
      return this[this.length - 1];
    }
  };

  prototype.filterExists = function <T>(this: T[]): NonNullable<T>[] {
    return this.filter((item) => item !== undefined) as NonNullable<T>[];
  };

  prototype.ofType = function <T, N extends T>(this: T[], type: Type<WrappedType<N>>): N[] {
    return this.filter((item) => item instanceof type || (item as any)?.constructor === type) as N[];
  };

  prototype.mapAsync = async function <T, R>(this: T[], selector: (item: T, index: number) => Promise<R>): Promise<R[]> {
    return await Promise.all(this.map(selector));
  };

  prototype.mapMany = function <T, R>(this: T[], selector?: (item: T, index: number) => R[]): T | R[] {
    const arr: any[] = selector ? this.map(selector) : this;
    return arr.length > 0 ? arr.reduce((p, n) => (p ?? []).concat(n ?? [])) : arr;
  };

  prototype.mapManyAsync = async function <T, R>(this: T[], selector?: (item: T, index: number) => Promise<R[]>): Promise<T | R[]> {
    const arr = selector !== undefined ? await this.mapAsync(selector) : this;
    return arr.mapMany();
  };

  prototype.parallelAsync = async function <T, R>(this: T[], fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
    return await Promise.all(this.map(async (item, index) => await fn(item, index)));
  };

  prototype.groupBy = function <T, K, V>(this: T[], keySelector: (item: T, index: number) => K, valueSelector?: (item: T, index: number) => V): { key: K; values: (V | T)[] }[] {
    const result: { key: K; values: (V | T)[] }[] = [];

    for (let i = 0; i < this.length; i++) {
      const keyObj = keySelector(this[i], i);
      const valueObj = valueSelector !== undefined ? valueSelector(this[i], i) : this[i];

      const existsRecord = result.single((item) => ObjectUtil.equal(item.key, keyObj));
      if (existsRecord !== undefined) {
        existsRecord.values.push(valueObj);
      }
      else {
        result.push({ key: keyObj, values: [valueObj] });
      }
    }

    return result;
  };

  prototype.toMap = function <T, K, V>(this: T[], keySelector: (item: T, index: number) => K, valueSelector?: (item: T, index: number) => V): Map<K, V | T> {
    const result = new Map<K, V | T>();

    for (let i = 0; i < this.length; i++) {
      const item = this[i];

      const keyObj = keySelector(item, i);
      const valueObj = valueSelector !== undefined ? valueSelector(item, i) : item;

      if (result.has(keyObj)) {
        throw new Error(`?????? ?????????????????????. (????????????: ${JSON.stringify(keyObj)})`);
      }
      result.set(keyObj, valueObj);
    }

    return result;
  };

  prototype.toMapAsync = async function <T, K, V>(this: T[], keySelector: (item: T, index: number) => Promise<K> | K, valueSelector?: (item: T, index: number) => Promise<V> | V): Promise<Map<K, V | T>> {
    const result = new Map<K, V | T>();

    for (let i = 0; i < this.length; i++) {
      const item = this[i];

      const keyObj = await keySelector(item, i);
      const valueObj = valueSelector !== undefined ? await valueSelector(item, i) : item;

      if (result.has(keyObj)) {
        throw new Error(`?????? ?????????????????????. (????????????: ${JSON.stringify(keyObj)})`);
      }
      result.set(keyObj, valueObj);
    }

    return result;
  };


  prototype.toObject = function <T, V>(this: T[], keySelector: (item: T, index: number) => string, valueSelector?: (item: T, index: number) => V): Record<string, V | T | undefined> {
    const result: Record<string, V | T | undefined> = {};

    for (let i = 0; i < this.length; i++) {
      const item = this[i];

      const key = keySelector(item, i);
      const valueObj = valueSelector !== undefined ? valueSelector(item, i) : item;

      if (result[key] !== undefined) {
        throw new Error(`?????? ?????????????????????. (????????????: ${key})`);
      }
      result[key] = valueObj;
    }

    return result;
  };

  prototype.distinct = function <T>(this: T[], matchAddress?: boolean): T[] {
    const result: T[] = [];
    for (const item of this) {
      if (!result.some((item1) => (matchAddress === true ? item1 === item : ObjectUtil.equal(item1, item)))) {
        result.push(item);
      }
    }

    return result;
  };

  prototype.distinctThis = function <T>(this: T[], matchAddress?: boolean): void {
    const distinctArray = this.distinct(matchAddress);
    this.clear().push(...distinctArray);
  };

  prototype.orderBy = function <T>(this: T[], selector?: (item: T) => (string | number | DateTime | DateOnly | Time | undefined)): T[] {
    return this.concat().sort((p, n) => {
      const pn = selector !== undefined ? selector(n) : n;
      const pp = selector !== undefined ? selector(p) : p;

      const cpn = pn instanceof DateOnly ? pn.tick
        : pn instanceof DateTime ? pn.tick
          : pn instanceof Time ? pn.tick
            : pn;
      const cpp = pp instanceof DateOnly ? pp.tick
        : pp instanceof DateTime ? pp.tick
          : pp instanceof Time ? pp.tick
            : pp;

      if (cpn === cpp) {
        return 0;
      }
      else if (typeof cpn === "string" && typeof cpp === "string") {
        return cpp.localeCompare(cpn);
      }
      else if (typeof cpn === "number" && typeof cpp === "number") {
        return (cpn > cpp ? -1 : cpn < cpp ? 1 : 0);
      }
      else if (typeof cpp === "undefined") {
        return -1;
      }
      else if (typeof cpn === "undefined") {
        return 1;
      }
      else {
        throw new Error("orderBy ??? string ?????? number ??? ???????????? ????????? ??? ????????????.");
      }
    });
  };

  prototype.orderByDesc = function <T>(this: T[], selector?: (item: T) => (string | number | DateTime | DateOnly | Time | undefined)): T[] {
    return this.concat().sort((p, n) => {
      const pn = selector !== undefined ? selector(n) : n;
      const pp = selector !== undefined ? selector(p) : p;

      const cpn = pn instanceof DateOnly ? pn.tick
        : pn instanceof DateTime ? pn.tick
          : pn instanceof Time ? pn.tick
            : pn;
      const cpp = pp instanceof DateOnly ? pp.tick
        : pp instanceof DateTime ? pp.tick
          : pp instanceof Time ? pp.tick
            : pp;

      if (cpn === cpp) {
        return 0;
      }
      else if (typeof cpn === "string" && typeof cpp === "string") {
        return cpn.localeCompare(cpp);
      }
      else if (typeof cpn === "number" && typeof cpp === "number") {
        return (cpn < cpp ? -1 : cpn > cpp ? 1 : 0);
      }
      else if (typeof cpp === "undefined") {
        return 1;
      }
      else if (typeof cpn === "undefined") {
        return -1;
      }
      else {
        throw new Error("orderBy ??? string ?????? number ??? ???????????? ????????? ??? ????????????.");
      }
    });
  };

  prototype.diffs = function <T, P>(this: T[], target: P[], options?: { keys?: string[]; excludes?: string[] }): TArrayDiffsResult<T, P>[] {
    const result: TArrayDiffsResult<T, P>[] = [];

    const uncheckedTarget = ([] as P[]).concat(target); // source ?????????, ???????????? ??????????????? ??????????????? ??????????????? ????????? target ??? ????????????

    for (const sourceItem of this) {
      //target ??? ????????? ????????? ?????? ???
      const sameTarget = uncheckedTarget.single((targetItem) => (
        ObjectUtil.equal(targetItem, sourceItem, options?.excludes !== undefined ? { excludes: options.excludes } : undefined)
      ));

      if (sameTarget === undefined) {
        //??? ?????????
        if (options?.keys !== undefined) {
          //target ??? ????????? ????????? ????????????, key ??? ????????? ?????? ??????: source => target ????????? ??????
          const sameKeyTargetItem = uncheckedTarget.single((targetItem) => ObjectUtil.equal(targetItem, sourceItem, { keys: options.keys }));
          if (sameKeyTargetItem !== undefined) {
            result.push({ source: sourceItem, target: sameKeyTargetItem });
            uncheckedTarget.remove(sameKeyTargetItem);
            continue;
          }
        }

        //??????: source ?????? ????????? ??????
        result.push({ source: sourceItem, target: undefined });
      }
      else {
        uncheckedTarget.remove(sameTarget);
      }
    }

    for (const uncheckedTargetItem of uncheckedTarget) {
      //target ??? ????????? ??????
      result.push({ source: undefined, target: uncheckedTargetItem });
    }

    return result;
  };

  prototype.oneWayDiffs = function <T extends Record<string, any>, K extends keyof T>(this: T[], orgItems: T[] | Map<T[K], T>, key: K, options?: { includeSame?: boolean; excludes?: string[] }): TArrayDiffs2Result<T>[] {
    const orgItemMap = orgItems instanceof Map ? orgItems : orgItems.toMap((orgItem) => orgItem[key]);
    const includeSame = options?.includeSame ?? false;

    const diffs: TArrayDiffs2Result<T>[] = [];
    for (const item of this) {
      if (item[key] === undefined) {
        diffs.push({ type: "create", item });
        continue;
      }

      const orgItem = orgItemMap.get(item[key]);
      if (!orgItem) {
        diffs.push({ type: "create", item });
        continue;
      }

      if (ObjectUtil.equal(orgItem, item, { excludes: options?.excludes })) {
        if (includeSame) {
          diffs.push({ type: "same", item, orgItem });
        }
        continue;
      }

      diffs.push({ type: "update", item, orgItem });
    }
    return diffs;
  };

  prototype.merge = function <T, P>(this: T[], target: P[], options?: { keys?: string[]; excludes?: string[] }): (T | P | (T & P))[] {
    const diffs = this.diffs(target, options);

    const result: (T | P | (T & P))[] = ObjectUtil.clone(this);
    for (const diff of diffs) {
      // ?????????
      if (diff.source !== undefined && diff.target !== undefined) {
        const resultSourceItem = result.single((item) => ObjectUtil.equal(item, diff.source));
        if (resultSourceItem === undefined) {
          throw new NeverEntryError();
        }
        result[result.indexOf(resultSourceItem)] = ObjectUtil.merge(diff.source, diff.target);
      }
      // ?????????
      else if (diff.target !== undefined) {
        result.push(diff.target);
      }
    }

    return result;
  };

  prototype.sum = function <T>(this: T[], selector?: (item: T, index: number) => number): number {
    let result = 0;
    for (let i = 0; i < this.length; i++) {
      const item = selector !== undefined ? selector(this[i], i) : this[i];
      if (typeof item !== "number") {
        throw new Error("sum ??? number ??? ???????????? ????????? ??? ????????????.");
      }
      result += item;
    }

    return result;
  };

  prototype.min = function <T>(this: T[], selector?: (item: T, index: number) => string | number): string | number | undefined {
    let result: string | number | undefined;
    for (let i = 0; i < this.length; i++) {
      const item = selector !== undefined ? selector(this[i], i) : this[i];
      if (typeof item !== "number" && typeof item !== "string") {
        throw new Error("min ??? number/string ??? ???????????? ????????? ??? ????????????.");
      }
      if (result === undefined || result > item) {
        result = item;
      }
    }

    return result;
  };

  prototype.max = function <T>(this: T[], selector?: (item: T, index: number) => string | number): string | number | undefined {
    let result: string | number | undefined;
    for (let i = 0; i < this.length; i++) {
      const item = selector !== undefined ? selector(this[i], i) : this[i];
      if (typeof item !== "number" && typeof item !== "string") {
        throw new Error("max ??? number/string ??? ???????????? ????????? ??? ????????????.");
      }
      if (result === undefined || result < item) {
        result = item;
      }
    }

    return result;
  };

  prototype.shuffle = function <T>(this: T[]): any[] {
    if (this.length <= 1) {
      return ObjectUtil.clone(this);
    }

    let result = this;
    while (true) {
      result = result.orderBy(() => Math.random());
      if (!ObjectUtil.equal(result, this)) {
        break;
      }
    }
    return result;
  };

  prototype.insert = function <T>(this: T[], index: number, ...items: T[]): T[] {
    this.splice(index, 0, ...items);
    return this;
  };

  prototype.remove = function <T>(this: T[], itemOrSelector: T | ((item: T, index: number) => boolean)): T[] {
    const removeItems = typeof itemOrSelector === "function" ? this.filter(itemOrSelector.bind(this)) : [itemOrSelector];

    for (const removeItem of removeItems) {
      while (this.includes(removeItem)) {
        this.splice(this.indexOf(removeItem), 1);
      }
    }

    return this;
  };

  prototype.clear = function <T>(this: T[]): T[] {
    return this.remove(() => true);
  };
})(Array.prototype);

export type TArrayDiffsResult<T, P> =
  { source: undefined; target: P } | // INSERT
  { source: T; target: undefined } | // DELETE
  { source: T; target: P }; // UPDATE

export type TArrayDiffs2Result<T> =
  { type: "create"; item: T } |
  { type: "update"; item: T; orgItem: T } |
  { type: "same"; item: T; orgItem: T };
