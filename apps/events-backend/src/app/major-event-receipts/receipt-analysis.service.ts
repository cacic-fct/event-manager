import { Injectable } from '@nestjs/common';

export interface ReceiptAnalysisResult {
  expectedAmountCents?: number;
  matchedAmountCents?: number;
  amountMatched: boolean;
  matchedAmountText?: string;
  nameMatched: boolean;
  matchedNameText?: string;
}

interface ParsedAmount {
  cents: number;
  text: string;
}

const NAME_PARTICLES = new Set(['de', 'da', 'das', 'do', 'dos', 'e']);

@Injectable()
export class ReceiptAnalysisService {
  analyze(text: string, personName: string, expectedAmountCents?: number | null): ReceiptAnalysisResult {
    const parsedAmounts = this.extractBrazilianRealAmounts(text);
    const matchedAmount = expectedAmountCents == null ? undefined : parsedAmounts.find((amount) => amount.cents === expectedAmountCents);
    const matchedNameText = this.findMatchingNameText(text, personName);

    return {
      expectedAmountCents: expectedAmountCents ?? undefined,
      matchedAmountCents: matchedAmount?.cents,
      amountMatched: expectedAmountCents == null ? false : !!matchedAmount,
      matchedAmountText: matchedAmount?.text,
      nameMatched: !!matchedNameText,
      matchedNameText,
    };
  }

  extractBrazilianRealAmounts(text: string): ParsedAmount[] {
    const matches: ParsedAmount[] = [];
    const amountPattern = /\bR\s*\$?\s*((?:\d{1,3}(?:[\s.]\d{3})+)|\d+)\s*,\s*(\d{2})\b/gi;

    for (const match of text.matchAll(amountPattern)) {
      const integerPart = match[1]?.replace(/[.\s]/g, '');
      const decimalPart = match[2];
      if (!integerPart || !decimalPart) {
        continue;
      }

      const reais = Number.parseInt(integerPart, 10);
      const cents = Number.parseInt(decimalPart, 10);
      if (Number.isNaN(reais) || Number.isNaN(cents)) {
        continue;
      }

      matches.push({
        cents: reais * 100 + cents,
        text: match[0].replace(/\s+/g, ' ').trim(),
      });
    }

    return matches;
  }

  findMatchingNameText(text: string, personName: string): string | undefined {
    const receiptTokens = this.normalizeNameTokens(text);
    const nameTokens = this.normalizeNameTokens(personName);
    if (nameTokens.length < 2 || receiptTokens.length === 0) {
      return undefined;
    }

    const receiptText = receiptTokens.join(' ');
    const fullName = nameTokens.join(' ');
    if (receiptText.includes(fullName)) {
      return fullName;
    }

    const initialsVariant = this.buildInitialsVariant(nameTokens);
    if (initialsVariant && receiptText.includes(initialsVariant)) {
      return initialsVariant;
    }

    const tokenSet = new Set(receiptTokens);
    const [firstName, ...otherNames] = nameTokens;
    if (firstName && tokenSet.has(firstName)) {
      const matchedOtherName = otherNames.find((token) => tokenSet.has(token));
      if (matchedOtherName) {
        return `${firstName} ${matchedOtherName}`;
      }
    }

    return undefined;
  }

  normalizeNameTokens(value: string): string[] {
    return value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 0 && !NAME_PARTICLES.has(token));
  }

  private buildInitialsVariant(tokens: string[]): string | undefined {
    if (tokens.length < 3) {
      return undefined;
    }

    const [firstName, ...remainingTokens] = tokens;
    const lastName = remainingTokens.at(-1);
    const middleTokens = remainingTokens.slice(0, -1);
    if (!firstName || !lastName || middleTokens.length === 0) {
      return undefined;
    }

    return [firstName, ...middleTokens.map((token) => token[0]).filter(Boolean), lastName].join(' ');
  }
}
