// electron-vite copies `?asset` imports into the build and resolves the path.
declare module "*.png?asset" {
  const path: string;
  export default path;
}
