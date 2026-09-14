// O esbuild embute arquivos .pem como texto (--loader:.pem=text); nos testes
// o Jest resolve o mesmo import para test/pem-stub.ts (ver moduleNameMapper).
declare module '*.pem' {
  const content: string;
  export default content;
}
