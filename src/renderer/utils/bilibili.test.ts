import { avToBv, bvToAv } from './bilibili';

/**
 * 验证 15 位超长 AV 号转换算法的正确性
 */
function runTest() {
    const testCases = [
        { av: '170001', expectedBv: 'BV17x411w7KC' }, // 经典号段
        { av: '115575875504174', expectedBv: 'BV1x2ynBmEC2' }, // 15位超长号段
        { av: '115542421673242', expectedBv: 'BV1UUCtBvERA' }, // 15位超长号段
    ];

    console.log('--- Bilibili ID 转换算法测试 ---');

    for (const { av, expectedBv } of testCases) {
        const actualBv = avToBv(av);
        const backToAv = bvToAv(actualBv);

        console.log(`\n测试 AV: ${av}`);
        console.log(`预期 BV: ${expectedBv}`);
        console.log(`实际 BV: ${actualBv}`);
        console.log(`反转 AV: ${backToAv}`);

        if (actualBv === expectedBv && backToAv === av) {
            console.log('✅ 测试通过！');
        } else {
            console.log('❌ 测试失败！');
        }
    }
}

// 如果你安装了 tsx 或 ts-node，可以直接运行这个文件
// npx tsx src/renderer/utils/bilibili.test.ts
runTest();
