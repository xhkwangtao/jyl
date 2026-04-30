const auth = require('../../../../../utils/auth')
const paymentService = require('../../../../../services/payment-service')
const orderService = require('../../../../../services/order-service')
const entitlementService = require('../../../../../services/entitlement-service')
const { setFeaturePaid } = require('../../../../../utils/audio-access.js')
const {
    GUIDE_MAP_PAGE
} = require('../../../../../utils/guide-routes')
const {
    withPageAnalytics
} = require('../../../../../utils/with-page-analytics')
const {
    PAID_FEATURE_KEYS
} = entitlementService

const DEFAULT_PRICE = 7.8
const DEFAULT_ORIGINAL_PRICE = 69
const DEFAULT_CURRENCY = 'CNY'
const DEFAULT_FEATURE_NAME = '研学道具'
const DEFAULT_DESCRIPTION = '购买成功后请前往游客中心索取您购买的研学道具'
const REMOTE_HERO_IMAGE = 'https://hyg-cdn.flexai.cc/common/xiaoyingdongzuo.png'
const LOCAL_HERO_IMAGE = '/images/ai-assistant-xiaoying.png'
const VIP_ACCESS_FEATURE_KEY = PAID_FEATURE_KEYS.VIP
const VIP_ENTITLED_FEATURE_KEYS = new Set([
    PAID_FEATURE_KEYS.AI_CHAT,
    PAID_FEATURE_KEYS.AI_CHAT_VOICE,
    PAID_FEATURE_KEYS.MAP_AUDIO_PLAY,
    PAID_FEATURE_KEYS.MAP_ROUTE_PLANNING,
    PAID_FEATURE_KEYS.MAP_NAVIGATION_START,
    PAID_FEATURE_KEYS.MAP_PHOTO_TUTORIAL,
    PAID_FEATURE_KEYS.STUDY_REPORT_GENERATE
])

const FEATURE_CONFIG = {
    [PAID_FEATURE_KEYS.AI_CHAT]: {
        title: DEFAULT_FEATURE_NAME,
        description: DEFAULT_DESCRIPTION
    },
    [PAID_FEATURE_KEYS.AI_CHAT_VOICE]: {
        title: DEFAULT_FEATURE_NAME,
        description: DEFAULT_DESCRIPTION
    },
    [PAID_FEATURE_KEYS.MAP_AUDIO_PLAY]: {
        title: DEFAULT_FEATURE_NAME,
        description: DEFAULT_DESCRIPTION
    },
    [PAID_FEATURE_KEYS.MAP_ROUTE_PLANNING]: {
        title: DEFAULT_FEATURE_NAME,
        description: DEFAULT_DESCRIPTION
    },
    [PAID_FEATURE_KEYS.MAP_NAVIGATION_START]: {
        title: DEFAULT_FEATURE_NAME,
        description: DEFAULT_DESCRIPTION
    },
    [PAID_FEATURE_KEYS.MAP_PHOTO_TUTORIAL]: {
        title: DEFAULT_FEATURE_NAME,
        description: DEFAULT_DESCRIPTION
    },
    [PAID_FEATURE_KEYS.STUDY_REPORT_GENERATE]: {
        title: DEFAULT_FEATURE_NAME,
        description: DEFAULT_DESCRIPTION
    },
    [PAID_FEATURE_KEYS.VIP]: {
        title: DEFAULT_FEATURE_NAME,
        description: DEFAULT_DESCRIPTION
    }
}

function safeDecode(value) {
    if (!value || typeof value !== 'string') {
        return ''
    }

    try {
        return decodeURIComponent(value)
    } catch (error) {
        return value
    }
}

function centsToYuan(amountCents) {
    const numeric = Number(amountCents)
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return DEFAULT_PRICE
    }

    return numeric / 100
}

function formatAmount(amount) {
    const numeric = Number(amount)
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return DEFAULT_PRICE.toFixed(2)
    }

    return numeric.toFixed(2)
}

function normalizeDisplayFeatureName(value) {
    const text = String(value || '').trim()
    if (!text) {
        return DEFAULT_FEATURE_NAME
    }

    if (/vip/i.test(text) || text.includes('会员') || text.includes('权益')) {
        return DEFAULT_FEATURE_NAME
    }

    return text
}

function grantPaidAccess(featureKey = '') {
    const normalizedFeatureKey = entitlementService.normalizeFeatureKey(featureKey)

    if (!normalizedFeatureKey) {
        return
    }

    setFeaturePaid(normalizedFeatureKey, true)

    if (
        normalizedFeatureKey === VIP_ACCESS_FEATURE_KEY
        || VIP_ENTITLED_FEATURE_KEYS.has(normalizedFeatureKey)
    ) {
        setFeaturePaid(VIP_ACCESS_FEATURE_KEY, true)
    }
}

function requestWxPayment(paymentParams = {}) {
    const timeStamp = String(paymentParams.timeStamp || paymentParams.time_stamp || '')
    const nonceStr = String(paymentParams.nonceStr || paymentParams.nonce_str || '')
    const packageValue = String(paymentParams.package || paymentParams.packageValue || '')
    const signType = String(paymentParams.signType || paymentParams.sign_type || 'RSA')
    const paySign = String(paymentParams.paySign || paymentParams.pay_sign || '')

    return new Promise((resolve, reject) => {
        wx.requestPayment({
            timeStamp,
            nonceStr,
            package: packageValue,
            signType,
            paySign,
            success: resolve,
            fail: reject
        })
    })
}

Page(withPageAnalytics('/subpackages/guide/pages/payment/subscribe/subscribe', {
    data: {
        productCode: 'vip',
        featureKey: 'vip',
        featureName: DEFAULT_FEATURE_NAME,
        description: DEFAULT_DESCRIPTION,
        amount: DEFAULT_PRICE,
        displayAmount: formatAmount(DEFAULT_PRICE),
        displayOriginalPrice: DEFAULT_ORIGINAL_PRICE.toFixed(2),
        currency: DEFAULT_CURRENCY,
        heroImageSrc: REMOTE_HERO_IMAGE,
        agreed: true,
        priceLoaded: false,
        loading: false,
        paymentError: '',
        successRedirectUrl: ''
    },

    onLoad(options = {}) {
        this.pendingSilentLoginPromise = null
        this.ensureSilentLogin()
        this.parseOptions(options)
        this.loadProductPrice()
    },

    onShow() {
        this.ensureSilentLogin()
    },

    parseOptions(options = {}) {
        const featureKey = entitlementService.normalizeFeatureKey(
            safeDecode(options.feature) || VIP_ACCESS_FEATURE_KEY
        ) || VIP_ACCESS_FEATURE_KEY
        const productCode = safeDecode(options.productCode)
            || safeDecode(options.product_code)
            || VIP_ACCESS_FEATURE_KEY
        const featureConfig = FEATURE_CONFIG[featureKey] || FEATURE_CONFIG[VIP_ACCESS_FEATURE_KEY]
        const amount = Number(options.amount)
        const originalPrice = Number(options.originalPrice)
        const featureName = normalizeDisplayFeatureName(
            safeDecode(options.featureName)
            || safeDecode(options.productName)
            || featureConfig.title
            || DEFAULT_FEATURE_NAME
        )
        const description = safeDecode(options.description)
            || featureConfig.description
            || DEFAULT_DESCRIPTION

        this.setData({
            productCode,
            featureKey,
            featureName,
            description,
            amount: Number.isFinite(amount) && amount > 0 ? amount : DEFAULT_PRICE,
            displayAmount: formatAmount(amount),
            displayOriginalPrice: formatAmount(originalPrice > 0 ? originalPrice : DEFAULT_ORIGINAL_PRICE),
            currency: safeDecode(options.currency) || DEFAULT_CURRENCY,
            successRedirectUrl: safeDecode(options.successRedirect)
        })
    },

    ensureSilentLogin() {
        if (this.pendingSilentLoginPromise) {
            return this.pendingSilentLoginPromise
        }

        this.pendingSilentLoginPromise = this.silentLogin().finally(() => {
            this.pendingSilentLoginPromise = null
        })

        return this.pendingSilentLoginPromise
    },

    async silentLogin() {
        try {
            const hasLogin = await auth.checkAndAutoLogin(2500)
            if (!hasLogin || !auth.getToken()) {
                return false
            }

            await auth.syncCurrentUserProfile().catch(() => null)
            return true
        } catch (error) {
            return false
        }
    },

    async loadProductPrice() {
        const productCode = String(this.data.productCode || '').trim() || 'vip'

        try {
            const pricePayload = await paymentService.getProductPrice(productCode)
            const currentAmount = centsToYuan(pricePayload.current_amount_cents)
            const originalAmount = centsToYuan(pricePayload.original_amount_cents)
            const remoteProductName = normalizeDisplayFeatureName(safeDecode(pricePayload.product_name))
            const remoteDescription = safeDecode(pricePayload.description)
            const currentFeatureName = String(this.data.featureName || '').trim()
            const currentDescription = String(this.data.description || '').trim()
            const shouldUseRemoteFeatureName = !currentFeatureName || currentFeatureName === DEFAULT_FEATURE_NAME
            const shouldUseRemoteDescription = !currentDescription || currentDescription === DEFAULT_DESCRIPTION

            this.setData({
                priceLoaded: true,
                amount: currentAmount,
                displayAmount: formatAmount(currentAmount),
                displayOriginalPrice: formatAmount(originalAmount > 0 ? originalAmount : currentAmount),
                currency: safeDecode(pricePayload.currency) || DEFAULT_CURRENCY,
                featureName: shouldUseRemoteFeatureName
                    ? (remoteProductName || currentFeatureName || DEFAULT_FEATURE_NAME)
                    : currentFeatureName,
                description: shouldUseRemoteDescription
                    ? (remoteDescription || currentDescription || DEFAULT_DESCRIPTION)
                    : currentDescription
            })
        } catch (error) {
            console.warn('[subscribe] load product price failed', error)
            this.setData({
                priceLoaded: false
            })
        }
    },

    onGoHome() {
        wx.reLaunch({
            url: '/pages/index/index',
            fail: () => {
                wx.redirectTo({
                    url: '/pages/index/index'
                })
            }
        })
    },

    toggleAgreement() {
        this.setData({
            agreed: !this.data.agreed
        })
    },

    onHeroImageError() {
        if (this.data.heroImageSrc === LOCAL_HERO_IMAGE) {
            return
        }

        this.setData({
            heroImageSrc: LOCAL_HERO_IMAGE
        })
    },

    showServiceAgreement() {
        const content = `九眼楼研学道具购买须知

一、服务说明
本页面用于购买九眼楼研学道具。购买成功后，请前往游客中心索取您购买的研学道具。
• 商品内容以页面展示信息为准
• 每笔订单默认购买一套研学道具
• 如现场发放规则调整，以景区实际通知为准

二、费用与支付
• 研学道具费用以页面显示价格为准
• 支付完成后订单即生效
• 如有优惠活动以实际支付页面为准

三、领取说明
• 购买成功后请前往游客中心领取
• 领取时请出示订单信息或支付记录
• 如遇特殊情况，请联系现场工作人员

四、退款政策
• 如因系统异常导致重复支付或无法下单，可联系客服处理
• 其他情况以景区现场规则和平台规则为准

五、用户义务
• 请妥善保管订单信息，便于现场领取核验
• 保护账号安全，不得转让或共享
• 遵守相关法律法规和平台规则

六、免责声明
• 因不可抗力或现场运营安排调整导致的发放变化，请以景区通知为准
• 用户自身原因导致的损失，平台不承担责任

七、服务变更
平台有权在法律允许范围内调整商品说明与领取规则，重大变更将提前通知用户。

联系我们：如有疑问请联系客服`

        wx.showModal({
            title: '购买须知',
            content,
            showCancel: true,
            cancelText: '返回',
            confirmText: '我知道了'
        })
    },

    showPrivacyPolicy() {
        const content = `九眼楼AI伴游助手隐私政策

我们深知个人信息对您的重要性，将严格保护您的隐私安全。本政策说明我们如何收集、使用、存储您的个人信息。

一、信息收集
我们可能收集以下信息：
• 基本信息：微信授权的昵称、头像
• 位置信息：用于导航和景点推荐（需您授权）
• 设备信息：设备型号、操作系统版本
• 使用数据：浏览记录、功能使用情况

二、信息使用
我们收集信息用于：
• 提供个性化的导游服务
• 改进产品功能和用户体验
• 客服支持和问题解决
• 服务统计和分析

三、信息共享
我们承诺：
• 不会出售您的个人信息
• 除法律要求外，不会向第三方披露
• 合作伙伴仅在提供服务必需时获得有限信息
• 所有数据传输均采用加密保护

四、信息安全
我们采取多重保护措施：
• 数据加密传输和存储
• 访问权限严格控制
• 定期安全评估和更新
• 24小时监控系统

五、您的权利
您有权：
• 查询、更正个人信息
• 删除账户和相关数据
• 撤回位置等敏感权限授权
• 投诉和举报隐私问题

六、Cookie和类似技术
我们使用本地存储技术优化用户体验，您可以通过设置管理这些数据。

七、政策更新
我们可能根据业务发展更新本政策，重大变更将通过应用内通知等方式告知您。

八、联系我们
如对隐私政策有疑问，请通过客服联系我们。
我们将在收到请求后尽快处理。`

        wx.showModal({
            title: '隐私政策',
            content,
            showCancel: true,
            cancelText: '返回',
            confirmText: '我知道了'
        })
    },

    async handlePay() {
        if (this.data.loading) {
            return
        }

        if (!this.data.agreed) {
            wx.showToast({
                title: '请先同意购买须知和隐私政策',
                icon: 'none',
                duration: 2000
            })
            return
        }

        this.setData({
            loading: true,
            paymentError: ''
        })

        try {
            const loginReady = await auth.checkAndAutoLogin(3000)
            if (!loginReady || !auth.getToken()) {
                throw new Error('登录失败，请稍后重试')
            }

            const paymentOrder = await paymentService.createJsapiPrepay({
                productCode: this.data.productCode || 'vip',
                quantity: 1,
                featureKey: this.data.featureKey
            })
            orderService.recordPendingOrder(paymentOrder)

            if (!paymentOrder.dry_run) {
                await requestWxPayment(paymentOrder.payment_params || {})
            }
            orderService.markOrderPaid(paymentOrder)

            grantPaidAccess(this.data.featureKey)

            this.setData({
                loading: false
            })

            wx.showToast({
                title: '购买成功',
                icon: 'success',
                duration: 1400
            })

            setTimeout(() => {
                this.navigateAfterPayment()
            }, 500)
        } catch (error) {
            const message = error?.errMsg || error?.message || '支付未完成，请稍后重试'
            this.setData({
                loading: false,
                paymentError: /cancel/i.test(message) ? '支付已取消' : message
            })

            wx.showToast({
                title: /cancel/i.test(message) ? '支付已取消' : '支付失败',
                icon: 'none',
                duration: 1800
            })
        }
    },

    navigateAfterPayment() {
        const successRedirectUrl = String(this.data.successRedirectUrl || '').trim()

        if (successRedirectUrl) {
            wx.redirectTo({
                url: successRedirectUrl,
                fail: () => {
                    wx.navigateTo({
                        url: successRedirectUrl,
                        fail: () => {
                            this.navigateToDefaultTarget()
                        }
                    })
                }
            })
            return
        }

        this.navigateToDefaultTarget()
    },

    navigateToDefaultTarget() {
        if (getCurrentPages().length > 1) {
            wx.navigateBack({
                delta: 1,
                fail: () => {
                    wx.redirectTo({
                        url: GUIDE_MAP_PAGE
                    })
                }
            })
            return
        }

        wx.redirectTo({
            url: GUIDE_MAP_PAGE
        })
    }
}))
