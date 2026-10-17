type Dates = { modifiedAt?: number; createdAt?: number; updatedAt?: number };

export function modificationDate(item: Dates) {
  return item.modifiedAt ? item.modifiedAt / 1000 : item.updatedAt || item.createdAt || 0;
}

export function libraryDates(item: { modifiedAt?: number; versions: { createdAt: number }[] }): Dates {
  const dates = item.versions.map(v => v.createdAt);
  return { modifiedAt: item.modifiedAt, updatedAt: Math.max(0, ...dates), createdAt: dates.length ? Math.min(...dates) : 0 };
}

export function folderDates(folder: Dates, children: Dates[]) {
  const dates = children.map(modificationDate);
  return {
    createdAt: folder.createdAt || 0,
    updatedAt: dates.some(date => date > 0) ? Math.max(...dates) : folder.updatedAt || folder.createdAt || 0,
  };
}

export function newestFirst(a: Dates, b: Dates) {
  return modificationDate(b) - modificationDate(a) ||
    (b.createdAt || 0) - (a.createdAt || 0);
}
