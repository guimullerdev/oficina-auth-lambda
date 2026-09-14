import { isValidCpf, normalizeCpf } from './cpf';

describe('normalizeCpf', () => {
  it('remove pontuação', () => {
    expect(normalizeCpf('529.982.247-25')).toBe('52998224725');
  });

  it('deixa string só de dígitos intacta', () => {
    expect(normalizeCpf('52998224725')).toBe('52998224725');
  });
});

describe('isValidCpf', () => {
  it.each(['52998224725', '529.982.247-25', '111.444.777-35'])(
    'aceita CPF válido: %s',
    (cpf) => {
      expect(isValidCpf(cpf)).toBe(true);
    },
  );

  it('rejeita CPF com dígito verificador errado', () => {
    expect(isValidCpf('52998224724')).toBe(false);
  });

  it.each([
    '00000000000',
    '11111111111',
    '99999999999',
  ])('rejeita sequência repetida: %s', (cpf) => {
    expect(isValidCpf(cpf)).toBe(false);
  });

  it.each(['123', '', '529982247251'])(
    'rejeita quantidade de dígitos diferente de 11: %s',
    (cpf) => {
      expect(isValidCpf(cpf)).toBe(false);
    },
  );

  it('rejeita CNPJ — só CPF autentica cliente', () => {
    expect(isValidCpf('11222333000181')).toBe(false);
  });

  it('rejeita texto sem dígitos', () => {
    expect(isValidCpf('abc.def.ghi-jk')).toBe(false);
  });
});
