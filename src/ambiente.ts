export interface ConexaoDoAmbiente {
  ambiente: string;
  databaseUrl: string;
}

/**
 * Descobre qual ambiente está sendo invocado a partir do alias no ARN.
 *
 * Variável de ambiente no Lambda pertence à **versão publicada**, não ao
 * alias — dois aliases apontando para a mesma versão compartilham o mesmo
 * `environment`. Então "um alias por ambiente" só separa de verdade se a
 * própria função escolher a configuração pelo alias que foi invocado.
 *
 * O ARN de uma invocação via alias termina no nome dele:
 *   arn:aws:lambda:us-east-1:123456789012:function:oficina-auth-cpf:prod
 *
 * Invocação sem alias (`$LATEST`, teste manual no console) não tem esse
 * último segmento.
 */
export function resolverAmbiente(invokedFunctionArn?: string): string | undefined {
  if (!invokedFunctionArn) {
    return undefined;
  }

  // arn : partition : service : region : account : "function" : nome [ : alias ]
  const partes = invokedFunctionArn.split(':');
  return partes.length >= 8 && partes[7] !== '' ? partes[7] : undefined;
}

/**
 * Ambiente e connection string correspondente.
 *
 * Falha fechado: sem alias reconhecível, não há palpite seguro a dar. Cair
 * num default significaria escolher entre atender homologação com dados de
 * produção ou o contrário — os dois são piores do que um erro claro.
 */
export function resolverConexao(invokedFunctionArn?: string): ConexaoDoAmbiente {
  const ambiente = resolverAmbiente(invokedFunctionArn);
  if (!ambiente) {
    throw new Error(
      'Invocação sem alias: não dá para saber o ambiente. Invoque pelo alias (homolog/prod).',
    );
  }

  const chave = `DATABASE_URL_${ambiente.toUpperCase()}`;
  const databaseUrl = process.env[chave];
  if (!databaseUrl) {
    throw new Error(`Ambiente "${ambiente}" sem configuração: ${chave} não definida.`);
  }

  return { ambiente, databaseUrl };
}
