import * as React from 'react';
// @ts-ignore
import WordCloud2 from 'wordcloud';
import { PomodoroRecord } from '../../monitor/type';
import { workers } from '../../workers';
import { Loading } from '../utils/Loading';
import { Card } from '../Kanban/type';

const tokenizer = workers.tokenizer;
const EMPTY_CARDS: Card[] = [];

interface Props {
    weights: [string, number][];
}

type MProps = Props & { [other: string]: any };
export const WordCloud: React.FC<MProps> = (props: MProps) => {
    const canvas = React.useRef<HTMLCanvasElement>();
    const { weights, ...restProps } = props;
    React.useEffect(() => {
        if (canvas.current === undefined) {
            return;
        }

        const context = canvas.current.getContext('2d');
        if (context) {
            context.clearRect(0, 0, canvas.current.width, canvas.current.height);
        }
        if (props.weights.length === 0) {
            return;
        }

        const width = canvas.current.clientWidth || props.width || 800;
        WordCloud2(canvas.current, {
            list: weights,
            gridSize: Math.round((8 * width) / 800),
            weightFactor: (size: number) => {
                return (Math.pow(size, 1.1) * width) / 800;
            },
            fontFamily: 'Times, serif',
            color: (word: string, weight: number) => {
                return weight >= 38 ? '#f02222' : '#c09292';
            },
            rotateRatio: 0.5,
            rotationSteps: 2,
            // Transparent so the canvas follows the active theme background.
            backgroundColor: 'transparent',
        });
    }, [weights]);

    // @ts-ignore
    return <canvas ref={canvas} {...restProps} />;
};

interface AsyncProps {
    records: PomodoroRecord[];
    cards?: Card[];
}

type MAsyncProps = AsyncProps & { [name: string]: any };
export const AsyncWordCloud: React.FC<MAsyncProps> = (props: MAsyncProps) => {
    const { records, cards = EMPTY_CARDS, ...restProps } = props;
    const [weights, setWeights] = React.useState<[string, number][]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    React.useEffect(() => {
        let cancelled = false;
        setIsLoading(true);
        tokenizer
            .tokenize(records, cards)
            .then((nextWeights) => {
                if (cancelled) {
                    return;
                }
                setWeights(nextWeights);
                setIsLoading(false);
            })
            .catch((error) => {
                if (!cancelled) {
                    console.error('[WordCloud] failed to tokenize records', error);
                    setWeights([]);
                    setIsLoading(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [records, cards]);
    return isLoading ? (
        <Loading size={'large'} height={400} />
    ) : (
        <WordCloud weights={weights} {...restProps} />
    );
};
