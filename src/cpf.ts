// Portado de src/modules/customers/domain/value-objects/cpf-cnpj.vo.ts do repo
// da app. Duplicado de propósito: a Lambda não depende do monólito (ver ADR
// 0001). Aqui só CPF — cliente pessoa jurídica não faz login por CPF.

export function normalizeCpf(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function isValidCpf(raw: string): boolean {
  const digits = normalizeCpf(raw);
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const checkDigit = (length: number): number => {
    let sum = 0;
    for (let i = 0; i < length - 1; i++) {
      sum += parseInt(digits[i], 10) * (length - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 || rest === 11 ? 0 : rest;
  };

  return (
    checkDigit(10) === parseInt(digits[9], 10) &&
    checkDigit(11) === parseInt(digits[10], 10)
  );
}
