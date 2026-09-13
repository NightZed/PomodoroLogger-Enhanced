/* istanbul ignore file */
import nedb from 'nedb';
import { dbPaths } from '../config';

const { projectDB, sessionDB, settingDB, kanbanDB, cardsDB, listsDB, moveDB } = dbPaths;
export let DBs = {
    projectDB: new nedb({ filename: projectDB }),
    sessionDB: new nedb({ filename: sessionDB }),
    settingDB: new nedb({ filename: settingDB }),
    kanbanDB: new nedb({ filename: kanbanDB }),
    cardsDB: new nedb({ filename: cardsDB }),
    listsDB: new nedb({ filename: listsDB }),
    moveDB: new nedb({ filename: moveDB }),
};

export type DBName =
    | 'projectDB'
    | 'sessionDB'
    | 'settingDB'
    | 'kanbanDB'
    | 'cardsDB'
    | 'listsDB'
    | 'moveDB';

export const dbNames: DBName[] = [
    'projectDB',
    'sessionDB',
    'settingDB',
    'kanbanDB',
    'cardsDB',
    'listsDB',
    'moveDB',
];

const loadedState: { [name: string]: boolean } = {};

// Avoid nedb init error
function loadDB(dbName: DBName): Promise<void> {
    if (loadedState[dbName]) {
        return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
        let times = 0;
        const load = () => {
            DBs[dbName].loadDatabase((err: Error | null) => {
                if (!err) {
                    loadedState[dbName] = true;
                    resolve();
                    return;
                }

                if (times > 20) {
                    reject(
                        `Cannot load database ${dbName} after 10 times tries. (${err.toString()})`
                    );
                    return;
                }

                setTimeout(load, 500);
                times += 1;
            });
        };

        load();
    });
}

/**
 * 按需加载数据库。
 * 主进程常驻只保留 settingDB，其余数据库在导入/导出等场景下按需加载，
 * 以降低常驻内存占用。不传参数时加载全部数据库（测试与 refreshDbs 使用）。
 */
export async function loadDBs(names?: DBName[]): Promise<void> {
    const targets = names || dbNames;
    const promises = targets.map((dbName) => loadDB(dbName));
    await Promise.race([
        Promise.all(promises),
        new Promise((_, r) => setTimeout(() => r(new Error('Timeout')), 20000)),
    ]);
}

export async function refreshDbs() {
    DBs = {
        projectDB: new nedb({ filename: projectDB }),
        sessionDB: new nedb({ filename: sessionDB }),
        settingDB: new nedb({ filename: settingDB }),
        kanbanDB: new nedb({ filename: kanbanDB }),
        cardsDB: new nedb({ filename: cardsDB }),
        listsDB: new nedb({ filename: listsDB }),
        moveDB: new nedb({ filename: moveDB }),
    };

    for (const key in loadedState) {
        delete loadedState[key];
    }

    await loadDBs();
    return DBs;
}
