```tsx
import { DualPieChart } from './DualPieChart';

// Compatibility name retained; this renders the dual treemap visualisation.

<DualPieChart
    appData={[
        { name: 'B', value: 12 },
        { name: 'A', value: 60 },
    ]}
    projectData={[
        { name: 'B', value: 12 },
        { name: 'A', value: 60 },
        { name: 'C', value: 30 },
    ]}
    onProjectClick={console.log}
/>;
```
