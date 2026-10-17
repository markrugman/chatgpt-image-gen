type Dates = { createdAt?: number; updatedAt?: number };

export function folderDates(folder: Dates, children: Dates[]) {
  const dates = children.map(child => child.updatedAt || child.createdAt || 0);
  return {
    createdAt: folder.createdAt || 0,
    updatedAt: dates.some(date => date > 0) ? Math.max(...dates) : folder.updatedAt || folder.createdAt || 0,
  };
}

export function newestFirst(a: Dates, b: Dates) {
  return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0) ||
    (b.createdAt || 0) - (a.createdAt || 0);
}
