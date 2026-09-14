// Stub do bundle de CAs usado só nos testes: o Jest não passa pelo esbuild,
// então não sabe carregar .pem. O conteúdo em si é irrelevante aqui — nenhum
// teste abre conexão TLS de verdade.
export default '-----BEGIN CERTIFICATE-----\nstub\n-----END CERTIFICATE-----\n';
