export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function publicPath(path: string) {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${BASE_PATH}${cleanPath}`;
}
