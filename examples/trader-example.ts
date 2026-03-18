/**
 * 东方财富交易客户端示例
 *
 * 使用说明：
 * 1. 安装依赖：确保已安装Node.js 18+
 * 2. 运行：npx tsx examples/trader-example.ts
 *
 * 注意：实际使用时需要真实的东方财富账户，且验证码识别需要额外实现
 */
import EastMoneyTrader, { EntrustStatus } from '../src/trader/index.js';
async function main() {
    console.log('=== 东方财富交易客户端示例 ===');

    // 创建交易客户端
    const trader = new EastMoneyTrader({});
    await trader.ensureLoggedIn();

    try {
        console.log('1. 获取资金余额...');
        const balance = await trader.getBalance();
        console.log('资金余额:', balance);

        console.log('2. 获取持仓...');
        const positions = await trader.getPosition();
        console.log('持仓数量:', positions.length);
        if (positions.length > 0) {
            console.log('第一个持仓:', positions[0]);
        }

        console.log('3. 获取委托单...');
        const entrusts = await trader.getEntrust();
        console.log('第一个委托单:', entrusts[0]);
        const cancelOrders = entrusts.filter(e => (e.entrustStatus === EntrustStatus.Pending || e.entrustStatus === EntrustStatus.Waiting));

        console.log(`总共${entrusts.length}个委托单，已提等待${cancelOrders.length}个委托单...`);
        if (cancelOrders.length > 0) {
            console.log('撤销第一个已报委托单...', cancelOrders[0]);
            const result = await trader.cancelEntrust(cancelOrders[0].entrustNo);
            console.log('撤销结果:', result);
        }

        console.log('4. 获取当日成交...');
        const deals = await trader.getCurrentDeal();
        console.log('当日成交数量:', deals.length);

        console.log('5. 获取股票信息...');
        const stockInfo = await trader.getStockInfo('600928');
        console.log('股票信息:', stockInfo);

        // 注意：以下交易操作是示例，实际执行需要真实账户和正确的参数
        console.log('\n=== 交易操作示例（模拟）===');
        console.log('注：以下操作不会实际执行，仅展示API调用方式');

        // 示例：买入100股某股票，价格10元
        // await trader.buy('600928', 3.68, 100);

        // 示例：卖出50股某股票，价格11元
        await trader.sell('600928', 4.11, 5000);

        console.log('\n=== 示例完成 ===');

    } catch (error) {
        console.error('发生错误:', error);
    } finally {
        // 退出客户端
        trader.exit();
    }
}

// 运行示例
main().catch(console.error);