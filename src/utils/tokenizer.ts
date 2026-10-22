import { PomodoroRecord } from '../renderer/monitor/type';
import { Counter } from './Counter';
import { Card } from '../renderer/components/Kanban/type';

export class Tokenizer {
    private rules: [string, RegExp][] = [
        ['appWithSuffix', /^((\w[.-])?\w)+/],
        ['word', /^\w[\w-]*/],
        ['number', /^\d\d*\.?\d*/],
    ];

    private unwantedSymbol = /[%&()（）,{}=+!@#$^*;:'"<>|\\/]/;

    public tokenize(s: string): string[] {
        const ans = [];
        const ss = s.split(this.unwantedSymbol);
        for (let str of ss) {
            while (str.length) {
                let found = false;
                for (const [_, reg] of this.rules) {
                    const match = str.match(reg);
                    if (match != null) {
                        // `match.entries().next().value[1]` stopped type checking
                        // with TypeScript 5; index 0 is the matched text
                        const matched = match[0];
                        ans.push(matched);
                        str = str.slice(matched.length);
                        found = true;
                    }
                }

                if (!found) {
                    str = str.slice(1);
                }
            }
        }

        return ans;
    }
}

const CardTitleWeight = 2;
const CardContentWeight = 0.5;
export const getWeightsFromPomodoros = (
    records: PomodoroRecord[],
    cards: Card[] = [],
    targetMax: number = 56,
    targetMin: number = 8
): [string, number][] => {
    const tokenWeights = new Counter();
    const tokenizer = new Tokenizer();

    // The same window title recurs across many sessions, and a long session DB
    // has far more (record, title) pairs than distinct titles. Tokenizing each
    // distinct title once is linear-algebraically identical to the old
    // per-record loop, but avoids repeating the regex tokenization thousands of
    // times.
    const titleWeights = new Map<string, number>();
    for (const record of records) {
        for (const app in record.apps) {
            const appRecord = record.apps[app];
            for (const title in appRecord.titleSpentTime) {
                const weight =
                    appRecord.titleSpentTime[title].normalizedWeight * record.spentTimeInHour;
                if (!Number.isFinite(weight) || weight === 0) {
                    continue;
                }
                titleWeights.set(title, (titleWeights.get(title) ?? 0) + weight);
            }
        }
    }

    for (const [title, weight] of titleWeights) {
        for (const token of tokenizer.tokenize(title)) {
            tokenWeights.add(token, weight);
        }
    }

    for (const card of cards) {
        tokenizer
            .tokenize(card.title)
            .forEach((token) =>
                tokenWeights.add(token, card.spentTimeInHour.actual * CardTitleWeight)
            );
        tokenizer
            .tokenize(card.content)
            .forEach((token) =>
                tokenWeights.add(token, card.spentTimeInHour.actual * CardContentWeight)
            );
    }

    const weights = tokenWeights.getNameValuePairs({ topK: 100 });
    const max = weights.reduce((prev, cur) => Math.max(prev, cur.value), 0);
    let min = weights.reduce((prev, cur) => Math.min(prev, cur.value), 10000);
    if (max === min) {
        min = max - 1;
    }

    return weights.map((v) => [
        v.name,
        ((v.value - min) / (max - min)) * (targetMax - targetMin) + targetMin,
    ]);
};
