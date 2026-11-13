```tsx
import styled from 'styled-components';
import { Bar } from './Bar';

const Container = styled.div`
    height: 100px;
    width: 200px;
`;

<Container>
    <Bar names={['A', 'B', 'C']} values={[11, 0, 20]} />
</Container>;
```

The number of stacked layers per column comes from the chart's own height
(`height / 4px`), so the component measures itself with a `ResizeObserver`.
An `<svg>` has no native `resize` event, and a chart that mounts while its tab
is hidden reports a height of 0 — a 0 measurement must be ignored, otherwise
every column collapses into one block and stays that way until reload.
