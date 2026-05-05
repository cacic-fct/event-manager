export function isValidCPF(cpf: string): boolean {
  cpf = cpf.replace(/\D/g, ''); // Remove non-digit characters

  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) {
    return false; // Invalid length or all digits are the same
  }

  const calculateCheckDigit = (cpf: string, factor: number): number => {
    let sum = 0;
    for (let i = 0; i < factor - 1; i++) {
      sum += parseInt(cpf.charAt(i)) * (factor - i);
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const firstCheckDigit = calculateCheckDigit(cpf, 10);
  const secondCheckDigit = calculateCheckDigit(cpf, 11);

  return (
    firstCheckDigit === parseInt(cpf.charAt(9)) &&
    secondCheckDigit === parseInt(cpf.charAt(10))
  );
}

export function formatCPF(cpf: string): string {
  cpf = cpf.replace(/\D/g, ''); // Remove non-digit characters

  if (cpf.length !== 11) {
    return cpf; // Return unformatted if length is not 11
  }

  return `${cpf.substring(0, 3)}.${cpf.substring(3, 6)}.${cpf.substring(
    6,
    9,
  )}-${cpf.substring(9)}`;
}

export function unformatCPF(cpf: string): string {
  return cpf.replace(/\D/g, ''); // Remove non-digit characters
}
