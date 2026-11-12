import type { CatalogShape } from './types';
import { en } from './en';

/**
 * The Simplified Chinese catalog. Typed as `CatalogShape<typeof en>`: a missing
 * or extra key, or an interpolation signature that differs from English, is a
 * `pnpm typecheck` error.
 */
export const zh: CatalogShape<typeof en> = {
    app: {
        title: 'Pomodoro Logger Enhanced',
    },

    common: {
        ok: '确定',
        cancel: '取消',
        save: '保存',
        delete: '删除',
        retry: '重试',
        choose: '选择',
        clear: '清除',
        reset: '重置',
        import: '导入',
        edit: '编辑',
    },

    theme: {
        day: '浅色',
        night: '深色',
    },

    window: {
        alwaysOnTopEnable: '启用窗口置顶',
        alwaysOnTopDisable: '取消窗口置顶',
        minimize: '最小化',
        maximize: '最大化',
        restore: '向下还原',
        close: '关闭',
    },

    search: {
        expand: '展开搜索面板',
    },

    calendar: {
        month: {
            jan: '1月',
            feb: '2月',
            mar: '3月',
            apr: '4月',
            may: '5月',
            jun: '6月',
            jul: '7月',
            aug: '8月',
            sep: '9月',
            oct: '10月',
            nov: '11月',
            dec: '12月',
        },
        weekday: {
            sun: '日',
            mon: '一',
            tue: '二',
            wed: '三',
            thu: '四',
            fri: '五',
            sat: '六',
        },
    },

    tour: {
        startGuide: '开始引导',
        resumeGuide: '继续引导',
        back: '上一步',
        exit: '退出引导',
        notNow: '暂不',
        takeMeThere: '点击前往',
        waiting: '正在等待高亮区域出现…',
        step: (current: number, total: number): string => `第 ${current} / ${total} 步`,
        timer: {
            start: '点击按钮开始倒计时。点击「确定」继续（引导期间不允许点击是正常现象）。',
            pause: '再次点击同一个按钮即可暂停计时。',
            stop: '可以在这里停止计时',
            focus: '每条番茄记录都会关联到你正在专注的看板项目',
            mode: '会话分为专注和休息两种，点击图标即可切换。',
        },
        kanban: {
            switchTab: '让我们切换到看板（点击看板标签，或按「确定」前往）',
            introOverview: '看板是一种可视化工作流程的管理方法。这里是所有看板的总览页面。',
            createClick: '我们来新建一个看板吧！',
            createConfirm: '给看板起个名字并保存，然后点击「确定」继续。',
            enter: '进入这个看板看看！（点击卡片）',
            boardLists: '看板默认有 4 个列表：Backlog、TODO、In Progress 和 Done。',
            boardCards: '每个列表都有自己的卡片，你可以新建卡片并在列表之间拖动它们',
            focusedList: '专注这个看板时，相关的番茄记录会关联到「进行中」列表里的卡片',
            openCard: '打开卡片配置页面看看',
            estimation:
                'Pomodoro Logger Enhanced 能帮你精确管理时间，' +
                '它会记录你在这项任务上的实际专注时长，' +
                '设置预估后还能评估你的预估准确度。',
        },
    },

    tabs: {
        timer: '番茄钟',
        kanban: '看板',
        history: '历史',
        setting: '设置',
    },

    timer: {
        tray: {
            startFocusing: '开始专注',
            startBreak: '开始休息',
            pause: '暂停',
            continue: '继续',
            finish: '结束',
            stop: '停止',
        },
        warning: {
            noProjectTitle: '未选择专注项目',
            noProjectContent:
                '你正在没有选择项目的情况下开始专注会话，该会话无法关联到任何项目。' +
                '点击「确定」仍然开始。',
            noFocusCardsTitle: '「进行中」列表没有卡片',
            noFocusCardsContent:
                '所选项目的「进行中」列表为空，该专注会话无法关联到任何卡片。' +
                '点击「确定」仍然开始。',
            dontRemindAgain: '不再提醒',
        },
        notify: {
            restEndedTitle: '休息结束',
            focusEndedTitle: '专注结束，开始休息吧',
            completedToday: (count: number): string => `今天已完成 ${count} 个番茄。\n\n`,
        },
        controls: {
            pause: '暂停 (F6)',
            start: '开始 (F5)',
            finish: '结束',
            switchMode: '切换模式 (Tab)',
            stop: '停止',
            showMore: '显示更多',
            switchTimerMode: '切换计时模式',
            switchTheme: '切换主题',
            minimize: '迷你模式 (F12)',
            compact: '紧凑模式 (F11)',
            normal: '普通模式 (F11)',
        },
        stats: {
            timeSpent: '已用时间',
            wordCloud: '词云',
            pomodorosToday: '今日番茄',
        },
        session: {
            projectName: '项目名称',
            confirm: '确定',
            break: '休息',
            finished: '会话结束',
            todayPomodoros: '今日番茄',
            startFocusing: '开始专注',
            startLongBreak: '开始长休',
            startShortBreak: '开始短休',
            longBreak: '长休',
            shortBreak: '短休',
            extend5: '延长 5 分钟',
            extend10: '延长 10 分钟',
            card: '卡片',
            noCard: '不挂卡',
            cardLine: (title: string, total: number): string => `卡片：${title}（共 ${total} 张）`,
        },
        focusSelector: {
            placeholder: '选择专注项目',
            none: '未选择项目',
        },
        mini: {
            startNext: '开始下一会话',
            expand: '展开 (F12)',
            noProject: '未选择项目',
            working: '专注中',
            breaking: '休息中',
            finish: '结束',
            statePaused: (phase: string): string => `${phase} - 已暂停`,
            stateRunning: (phase: string): string => `${phase} - 运行中`,
        },
    },

    kanban: {
        page: {
            overviewTitle: '看板总览',
            sortedBy: '排序方式：',
            sortRecent: '最近访问',
            sortCreated: '创建时间',
            sortAlpha: '字母顺序',
            sortSpent: '已用时间',
            sortRemaining: '剩余时间',
            ascending: '升序',
            descending: '降序',
            showTable: '显示表格：',
            boardScope: '看板可见性',
            activeBoards: '活跃',
            hiddenBoards: (count: number): string => `已隐藏 (${count})`,
            noActiveBoards: '没有活跃的看板',
            noHiddenBoards: '没有已隐藏的看板',
            cardView: '卡片视图',
            cardTitleOnly: '仅标题',
            cardPreview: '预览（限制高度）',
            cardFull: '完整内容',
            created: '创建于',
        },
        overview: {
            boardName: '看板名称',
            estimatedLeft: '预计剩余时间',
            spentTime: '已用时间',
            pomodoros: '番茄数',
            meanError: '平均预估偏差',
            trend: '趋势',
        },
        boardEditor: {
            createTitle: '新建看板',
            editTitle: '编辑',
            create: '创建',
            name: '名称',
            nameRequired: '请输入看板名称！',
            nameTooLong: '名称最长 48 个字符',
            duplicate: (name: string): string => `看板「${name}」已存在`,
            hidden: '隐藏此看板',
            hiddenHint: '隐藏后不会出现在看板总览和番茄钟的项目选择里，历史记录仍保留项目名。',
            edit: '编辑',
            preview: '预览',
        },
        list: {
            focused: '专注列表',
            done: '完成列表',
            cardCount: (count: number): string => `${count} 张卡片`,
        },
        dragFailed: '无法移动卡片，看板已重新加载。',
        cardPicker: {
            title: (board: string): string => `选择卡片 · ${board}`,
            noCard: '不挂卡',
            cancel: '取消',
            empty: '这个看板还没有卡片',
            untitled: '（无标题）',
        },
        cardMove: {
            button: '移动到…',
            listTitle: (board: string): string => `移动到 · ${board}`,
            sessions: (count: number): string => `这张卡片的 ${count} 个番茄记录会一并迁移`,
            shared: (count: number): string =>
                `其中 ${count} 条同时属于其他卡片，会先从那些卡片移出`,
            irreversible: '此操作不可撤销。',
            cancel: '取消',
            confirm: '移动',
            moved: '卡片已移动',
            failed: (detail: string): string => '移动失败' + (detail ? `：${detail}` : ''),
        },
        projectPicker: {
            title: '选择项目',
            search: '搜索项目…',
            sortCreated: '创建时间',
            sortVisited: '最近使用',
            sortName: '名称',
            none: '无项目',
            empty: '没有匹配的项目',
            hidden: '已隐藏',
        },
        unassigned: {
            button: (count: number): string => `未分配 (${count})`,
            title: (board: string): string => `未分配 · ${board}`,
            hint: '这些专注还没有被任何卡片计入。',
            empty: '没有等待挂卡的记录',
            noCard: '未挂卡',
            appCount: (count: number): string => `${count} 个应用`,
            more: (count: number): string => `还有 ${count} 条未显示`,
            selected: (count: number): string => `已选 ${count} 条`,
            assignTo: '批量设置卡片',
            save: '保存',
            nothingPicked: '请先为至少一条记录选择卡片',
            confirmTitle: '挂到这些卡片？',
            confirmBody: (count: number): string => `${count} 条记录会被所选卡片计入。`,
            saved: '已挂卡',
            saveFailed: (detail: string): string => '挂卡失败' + (detail ? `：${detail}` : ''),
        },
        cardEditor: {
            createTitle: '新建卡片',
            editTitle: '编辑',
            titleRequired: '请输入卡片标题！',
            title: '标题',
            description: '描述',
            estimatedTime: '预计用时（小时）',
            actualTime: '实际用时（小时）',
            actualSpentTime: '实际用时（小时）',
            completedTime: '完成时间',
            lastCompletedTime: '最近完成时间',
            completionPlaceholder: '完成时间',
            labels: '标签',
            edit: '编辑',
            preview: '预览',
            insertLink: '插入链接',
            insert: '插入',
            ctrlEnter: 'Ctrl+Enter',
            checkbox: '插入任务复选框 - [ ] (Ctrl+L)',
            bold: '切换粗体 **文本** (Ctrl+B)',
            italic: '切换斜体 *文本* (Ctrl+I)',
            strikethrough: '切换删除线 ~~文本~~ (Ctrl+Shift+X)',
            link: '插入链接 [文本](URL) (Ctrl+K)',
        },
        card: {
            created: '创建于',
            completed: '已完成',
            lastCompleted: '最近完成',
        },
        labelEditor: {
            color: '颜色：',
            remove: '删除标签',
            namePlaceholder: '标签名称',
        },
        brief: {
            perfect: '完美',
            good: '良好',
            fair: '一般',
            poor: '较差',
            bad: '很差',
            accuracy: '预估准确度',
        },
        defaultList: {
            backlog: 'Backlog',
            todo: 'TODO',
            inProgress: 'In Progress',
            done: 'Done',
        },
        demoCard: {
            welcome: '欢迎✨',
            content:
                '这是一张 #demo 卡片 🎈。\n' +
                '## 用法 \n\n' +
                '- **可拖拽**\n' +
                '- 支持 **Markdown**\n' +
                '- 点击编辑内容\n' +
                '- Ctrl+Enter 保存卡片\n' +
                '- 点击标签筛选卡片\n' +
                '\n### 自己试试！\n\n' +
                '[ ] 把这张卡片拖到「进行中」\n' +
                '[ ] 用 Markdown 编辑我\n' +
                '[ ] 设置预计用时',
        },
    },

    history: {
        all: '全部',
        pomodorosToday: '今日番茄',
        pomodorosThisWeek: '本周番茄',
        pomodorosThisMonth: '本月番茄',
        loadFailed: (detail: string): string => '加载历史数据失败' + (detail ? `：${detail}` : ''),
        noData: '暂无数据',
        projectFilter: '设置项目筛选',
        allProjects: '所有项目',
        manage: '管理',
        sessionEditor: {
            title: (date: string): string => `${date} 的记录`,
            all: '全部',
            unassigned: '未挂卡',
            noProject: '无项目',
            noProjectValue: '无项目',
            unknownProject: 'Unknown',
            unassignedCard: '未挂卡',
            cardMore: (title: string, count: number): string => `${title} +${count}`,
            selectAll: '全选',
            selected: (count: number): string => `已选 ${count} 条`,
            delete: '删除',
            undoDelete: '撤销',
            batchProject: '批量设置项目',
            batchCard: '批量设置卡片',
            batchCardNeedsBoard: '请先选中同一项目的记录',
            save: '保存',
            cancel: '取消',
            nothingToSave: '没有需要保存的改动',
            confirmTitle: '应用这些改动？',
            confirmBody: (changed: number, deleted: number): string =>
                `将修改 ${changed} 条记录、删除 ${deleted} 条。删除不可恢复。`,
            saved: '会话记录已更新',
            saveFailed: (detail: string): string =>
                '更新会话记录失败' + (detail ? `：${detail}` : ''),
            discardTitle: '放弃未保存的改动？',
            discardBody: '现在关闭会丢失还没保存的修改。',
            empty: '这一天没有记录',
        },
    },

    chart: {
        trend: '趋势',
        sankey: {
            title: '桑基图',
            focused: '专注',
            distracted: '分心',
            exitHint: '（点击背景或按 Esc 退出）',
        },
        treemap: {
            projects: '项目',
            applications: '应用',
            others: '其他',
            projectSeries: '项目时长',
            applicationSeries: '应用时长',
        },
        badge: {
            spentTime: '已用时间',
            extra: '超出',
            left: '剩余',
            extraTime: '超出时间',
            leftTime: '剩余时间',
        },
    },

    guard: {
        expect: {
            nonEmptyString: '非空字符串',
            finiteNumber: '有限数字',
            stringArray: '字符串数组',
            array: '数组',
            object: '对象',
        },
        describe: {
            null: 'null',
            array: '数组',
            object: '对象',
            type: (type: string): string => `${type} 类型`,
            emptyStrings: '一个包含空字符串的数组',
            entry: (index: number, found: string): string => `第 ${index} 项是${found}的数组`,
        },
        import: {
            overflow: (count: number): string => `另有 ${count} 个问题未列出`,
            missing: (expectation: string): string => `缺失；此处需要${expectation}`,
            mismatch: (expectation: string, found: string): string =>
                `应为${expectation}，实际是${found}`,
            array: (found: string): string => `应为数组，实际是${found}`,
            object: (found: string): string => `应为对象，实际是${found}`,
            finiteNumber: (found: string): string => `应为有限数字，实际是${found}`,
            fileNotObject: (found: string): string => `文件内容应为对象，实际是${found}`,
            missingSpentTime: '缺失；此处需要包含 "actual" 和 "estimated" 的对象',
            refersToCard: (id: string): string => `引用了卡片 ${id}，但该卡片不在文件中`,
            refersToList: (id: string): string => `引用了列表 ${id}，但该列表不在文件中`,
            moveDropped: (id: string): string =>
                `卡片 ${id} 的移动记录引用了不在文件中的卡片，该移动记录将被丢弃`,
            sessionNotCounted: (id: string): string =>
                `引用了番茄记录 ${id}，但该记录不在文件中，其时长不会被统计`,
        },
        merge: {
            cardRemoved: (id: string): string => `卡片 ${id} 将被移除`,
        },
    },

    dataRepair: {
        title: '数据检查',
        intro: '选择要处理的问题。恢复只会把卡片放回你选的列表，不会删除任何东西。',
        empty: '没有需要处理的问题',
        cards: '卡片',
        detachedGroup: (count: number): string => `来自已删除的看板 / 列表（${count}）`,
        orphanGroup: (count: number): string => `不属于任何列表（${count}）`,
        lists: (count: number): string => `列表（${count}）`,
        listNote: '原看板已删除，这些列表不再出现在任何看板中。删除列表不会删除其中的卡片。',
        moves: (count: number): string => `移动记录（${count}）`,
        movesNote: (count: number): string => `涉及 ${count} 张已不存在的卡片。`,
        dangling: (count: number): string => `悬空引用（${count}）`,
        danglingNote: '修复只移除指向不存在数据的引用，不会删除任何卡片、列表或番茄记录。',
        danglingBoardLists: (owner: string, count: number): string =>
            `看板「${owner}」有 ${count} 处无效的列表引用`,
        danglingListCards: (owner: string, count: number): string =>
            `列表「${owner}」有 ${count} 处无效的卡片引用`,
        danglingCardSessions: (owner: string, count: number): string =>
            `卡片「${owner}」有 ${count} 处无效的番茄引用`,
        selectAll: '全选',
        restore: '恢复',
        restoreSelected: (count: number): string => `恢复选中 (${count})`,
        restored: (count: number): string => `已恢复 ${count} 张卡片`,
        restoreFailed: '恢复失败',
        restoreFailedDetail: (restored: number, detail: string): string =>
            `失败前已恢复 ${restored} 张卡片：${detail}`,
        applySelected: (count: number): string => `处理选中项 (${count})`,
        selected: (count: number): string => `已选 ${count} 项`,
        sessions: (count: number): string => `${count} 个番茄`,
        noRecord: '未记录时长',
        untitled: '（无标题）',
        showAll: (count: number): string => `显示全部（还有 ${count} 条）`,
        confirmTitle: '处理这些数据问题？',
        confirmDelete: '会删除：',
        confirmRepair: '会修复：',
        confirmCards: (count: number): string => `卡片 ${count} 张`,
        confirmLists: (count: number): string => `列表 ${count} 个`,
        confirmMoves: (count: number): string => `移动记录 ${count} 条`,
        confirmRefs: (count: number): string => `引用 ${count} 处`,
        confirmNote: '删除不可撤销；番茄记录不受影响。',
        confirmOk: '确认处理',
        done: (cards: number, lists: number, moves: number, refs: number): string =>
            `已删除 ${cards} 张卡片、${lists} 个列表、${moves} 条移动记录，修复 ${refs} 处引用`,
        failed: '数据修复失败',
        failedDetail: (detail: string): string => `数据未能修复：${detail}`,
    },

    settings: {
        sectionsLabel: '设置分区',
        sections: {
            timer: '计时器',
            appearance: '外观',
            notification: '通知',
            shortcuts: '快捷键',
            system: '系统',
            about: '关于',
        },
        language: {
            system: '跟随系统',
            zh: '简体中文',
            en: 'English',
        },
        shortcuts: {
            title: '键盘快捷键',
            disclaimer: '这些快捷键内置于应用中，暂不支持自定义。',
            group: {
                navigation: '导航',
                window: '窗口',
                timer: '计时器',
                kanban: '看板',
                editors: '编辑器',
                statistics: '统计',
            },
            nextTab: '切换到下一个标签页',
            previousTab: '切换到上一个标签页',
            toggleCompact: '切换紧凑模式',
            toggleMini: '切换迷你模式',
            quit: '退出应用',
            startSession: '开始或继续当前会话',
            pauseSession: '暂停当前会话',
            switchMode: '在专注与休息之间切换',
            newBoard: '新建看板',
            backToBoardList: '返回看板列表或计时器页面',
            searchCards: '在看板视图中搜索卡片',
            saveEditor: '保存正在编辑的卡片或看板',
            devTools: '打开开发者工具',
            closeDiagram: '关闭全屏图表',
        },
        system: {
            language: '语言',
            languageHint: '立即生效，托盘菜单与系统通知也会同步切换。',
            compactAlwaysOnTop: '紧凑窗口始终置顶',
            startup: '启动',
            startOnBoot: '开机自动启动',
            hardwareAcceleration: '硬件加速',
            unloadOnCloseToTray: '隐藏到托盘时释放页面内存',
            unloadOnCloseToTrayHint:
                '窗口收进托盘 30 秒后，卸载仍在后台的页面。重新打开窗口时会重建，' +
                '历史页需要重新计算统计。',
            update: '更新',
            autoUpdate: '自动更新',
            checkUpdate: '检查更新',
            dataManagement: '数据管理',
            openDataFolder: '打开数据文件夹',
            logging: '日志',
            logLevel: '日志级别',
            logLevelHint:
                '立即生效。Debug 会记录应用在后台做了什么——' +
                '除非要反馈问题，否则保持 Info 即可。',
            logLevelDebug: 'Debug',
            logLevelInfo: 'Info',
            logLevelWarn: 'Warn',
            logLevelError: 'Error',
            openLogFolder: '打开日志文件夹',
            exportData: '导出数据',
            importData: '导入数据',
            checkData: '检查并修复数据',
            deleteAllData: '删除所有数据',
        },
        timer: {
            focusDuration: '专注时长',
            shortBreak: '短休',
            longBreak: '长休',
            minFinish: '结束番茄钟前的最短专注时间',
            minFinishHint: '可调范围上限随上方的专注时长动态调整；设为「任意」（0）可随时结束。',
            distracting: '分心应用设置',
            any: '任意',
        },
        appearance: {
            theme: '主题',
            switchToTheme: (name: string): string => `切换到${name}主题`,
            followSystem: '跟随系统',
            contentOpacity: '内容不透明度',
            contentOpacityHint:
                '让标题栏和页面（含文字与图标）变淡，弹窗和提示也会一起变淡；' +
                '窗口背景由下方单独的滑块控制，不受影响。',
            backgroundOpacity: '背景不透明度',
            backgroundOpacityHint:
                '桌面从窗口背景中透出的程度。下限高于零，避免背景完全消失；文字保持自己的不透明度。',
            wallpaper: '背景壁纸',
            wallpaperOpacity: '壁纸不透明度',
            calendarBaseColor: '日历基础色',
        },
        notification: {
            screenshot: '截图',
            screenshotHint: '会话运行期间每 5 分钟截一次图。',
            focusStartWarning: '开始专注前提醒',
            focusStartWarningHint: '在没有选择项目时开始专注会话，会先请求确认。',
            sessionEnd: '会话结束',
            sessionEndHint: '会话结束时会播放提示音。不会发送桌面通知：结束界面会接管整个窗口。',
        },
        about: {
            hint: '一款结合番茄工作法和看板任务管理的时间记录工具。',
            feedback: '反馈',
            githubTitle: '本项目开源并托管在 GitHub 上',
        },
        distracting: {
            title: '分心应用设置',
            regexp: '正则',
            app: '应用',
            appPlaceholder: '应用正则',
            titleLabel: '标题',
            titlePlaceholder: '标题正则',
            remove: '删除规则',
            addField: '添加规则',
        },
        footer: {
            openSource: '开源 @GitHub',
            version: (version: string): string => `版本 v${version}`,
        },
    },

    native: {
        tray: {
            open: '打开',
            quit: '退出',
        },
        dialog: {
            crashTitle: 'Pomodoro Logger Enhanced 意外停止',
            crashBody: (logDir: string): string =>
                '应用遇到无法恢复的错误，必须关闭。\n\n' + `详细信息已写入：\n${logDir}`,
            migrationTitle: '数据库迁移失败',
            migrationBody: (error: string): string =>
                'Pomodoro Logger Enhanced 无法迁移旧数据库。\n\n' +
                '原有的 .nedb 文件未被改动。请先备份 db 目录，然后反馈以下错误：\n\n' +
                error,
        },
        fileFilter: {
            json: 'JSON',
            allFiles: '所有文件',
            images: '图片',
        },
        importNotJson: (detail: string): string =>
            '该文件不是合法的 JSON：' + detail + '（请确认文件没有被从 .json 改名）',
        updater: {
            notPackaged: '仅已安装的应用可以检查更新',
            notAvailable: (version: string): string => `当前已是最新版本（v${version}）`,
            artifactsMissing: '发布文件仍在上传中，请稍后再试',
        },
    },

    /** 整窗错误页：在 ConfigProvider 之外渲染，不依赖任何状态库。 */
    crash: {
        title: 'Pomodoro Logger Enhanced 出错了',
        body: '界面发生了故障，已经记录的番茄数据都安全保存在数据库里。',
        hint:
            '错误已写入日志文件。通常重启即可恢复；' +
            '如果反复出现，请打开日志文件夹，把文件附加到问题反馈中。',
        restart: '重启',
        quit: '退出',
        copy: '复制详情',
        copied: '已复制',
        details: '技术细节',
        logFolder: '打开日志文件夹',
        logLocation: (dir: string): string => `日志：${dir}`,
        session: (id: string): string => `会话：${id}`,
    },

    feedback: {
        kanban: {
            startFocusing: '开始专注',
            paused: '已暂停',
            labelExists: '标签已存在',
            cannotDeleteList: '无法删除正在专注 / 已完成的列表。',
            deleteListConfirm: (title: string): string => `删除列表「${title}」？`,
            deleteListDetail: '列表中的所有卡片会一并删除。',
            deleteCardConfirm: (title: string): string => `删除卡片「${title}」？`,
            deleteCardDetail: '此操作无法撤销。',
            deleteBoardConfirm: (name: string): string => `删除看板「${name}」？`,
            deleteBoardDetail: '看板中的所有列表和卡片会一并删除。',
        },
        timer: {
            cannotSwitchMode: (isFocusing: boolean, isRunning: boolean): string =>
                `无法在${isFocusing ? '专注' : '休息'}会话${
                    isRunning ? '进行中' : '已暂停'
                }时切换模式 —— 请先${isRunning ? '暂停' : '继续'}或停止它。`,
            finishTooEarly: (minMinutes: number): string => `至少专注 ${minMinutes} 分钟才能结束`,
        },
        statistics: {
            sankeyOutdated: '无法绘制桑基图。所选番茄记录来自缺少必要数据的版本',
        },
        confirm: {
            defaultTitle: '确定吗？',
        },
        setting: {
            restartToApply: '重启应用以应用更改',
            screenshotRestart: '截图设置需要重启应用后生效',
            hardwareAccelerationRestart: '硬件加速设置需要重启应用后生效',
            openDataDirFailed: '无法打开数据文件夹',
            openDataDirFailedDetail: (reason: string): string => `无法打开数据文件夹：${reason}`,
            openLogDirFailed: '无法打开日志文件夹',
            openLogDirFailedDetail: (reason: string): string => `无法打开日志文件夹：${reason}`,
            importConfirm: '导入后 Pomodoro Logger Enhanced 将重启，是否继续？',
            deleteAllConfirm: '删除所有会话、项目和看板？',
            deleteAllRestartNote: '设置会被保留。此操作不可撤销，删除完成后应用将立即重启。',
            deleteFailed: '无法删除数据',
            deleteFailedDetail: (reason: string): string =>
                `数据未能完全删除：${reason}。部分数据可能已被删除，应用未重启。`,
            dataCheckNone: '没有发现数据问题',
            dataCheckFailed: '检查失败',
            dataCheckFailedDetail: (reason: string): string => `数据未能检查：${reason}`,
            exportDone: (fileName: string): string => `数据已导出到 ${fileName}`,
            exportFailed: '导出失败',
            exportFailedDetail: (reason: string): string => `数据无法导出：${reason}`,
            importInvalidTitle: '该文件无法导入',
            importInvalidIntro:
                '没有导入任何数据，现有数据保持原样。' + '请先修正文件中的以下问题，然后重新导入：',
            importWarningTitle: '导入完成，但有警告',
            importWarningIntro: '数据已导入，但部分条目被调整过：',
            importDone: '数据已导入，正在重启…',
            importRestartNote: '关闭本对话框后应用将重启。',
            importIssuesLogged: '完整问题列表已写入日志文件夹。',
            importFailedHint: '详细信息请查看日志文件夹。',
            importFailed: '导入失败',
            importFailedDetail: (reason: string): string => `数据无法导入：${reason}`,
        },
        update: {
            available: '有可用更新',
            availableIntro: '发现新版本：',
            availableQuestion: '现在开始下载吗？',
            downloadNow: '下载',
            downloading: '正在下载更新',
            downloaded: '更新已下载',
            downloadedDescription: '立即重启安装更新，或退出应用稍后安装。',
            restartAndInstall: '重启并安装',
            installing: '正在安装更新',
            installingDescription: '应用正在退出以安装更新，安装完成后会自动重新启动。',
            failed: (phase: string): string => `更新${phase}失败`,
            phase: {
                check: '检查',
                download: '下载',
                install: '安装',
            },
            versionLabel: '版本',
            manualDownloadHint: '你也可以手动下载：',
            checkFailed: (detail: string): string => `检查更新失败：${detail}`,
        },
    },
};
