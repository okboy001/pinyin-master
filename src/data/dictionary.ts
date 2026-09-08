import type { WordEntry } from '../types';

/** Unique high-frequency words: traditional|simplified|pinyin — no duplicates padded to fake 10k */
const RAW_WORDS = [
  // daily / people
  '真實|真实|zhēn shí', '朋友|朋友|péng you', '漂亮|漂亮|piào liang', '蘋果|苹果|píng guǒ',
  '貓咪|猫咪|māo mī', '天空|天空|tiān kōng', '可愛|可爱|kě ài', '星星|星星|xīng xing',
  '時間|时间|shí jiān', '學習|学习|xué xí', '學校|学校|xué xiào', '電腦|电脑|diàn nǎo',
  '手機|手机|shǒu jī', '吃飯|吃饭|chī fàn', '睡覺|睡觉|shuì jiào', '衣服|衣服|yī fu',
  '機場|机场|jī chǎng', '音樂|音乐|yīn yuè', '快樂|快乐|kuài lè', '悲傷|悲伤|bēi shāng',
  '努力|努力|nǔ lì', '世界|世界|shì jiè', '風景|风景|fēng jǐng', '海洋|海洋|hǎi yáng',
  '放棄|放弃|fàng qì', '環境|环境|huán jìng', '挑戰|挑战|tiǎo zhàn', '夢想|梦想|mèng xiǎng',
  '自由|自由|zì yóu', '愛情|爱情|ài qíng', '希望|希望|xī wàng', '溫柔|温柔|wēn róu',
  '宇宙|宇宙|yǔ zhòu', '魔法|魔法|mó fǎ', '命運|命运|mìng yùn', '奇蹟|奇迹|qí jì',
  '靈魂|灵魂|líng hún', '永恆|永恒|yǒng héng', '毀滅|毁灭|huǐ miè', '守護|守护|shǒu hù',
  '知識|知识|zhī shi', '經驗|经验|jīng yàn', '決定|决定|jué dìng', '選擇|选择|xuǎn zé',
  '相信|相信|xiāng xìn', '懷疑|怀疑|huái yí', '理解|理解|lǐ jiě', '支持|支持|zhī chí',
  '國家|国家|guó jiā', '社會|社会|shè huì', '經濟|经济|jīng jì', '文化|文化|wén huà',
  '歷史|历史|lì shǐ', '科學|科学|kē xué', '技術|技术|jì shù', '藝術|艺术|yì shù',
  '太陽|太阳|tài yáng', '月亮|月亮|yuè liang', '森林|森林|sēn lín', '沙漠|沙漠|shā mò',
  '高山|高山|gāo shān', '河流|河流|hé liú', '冰雪|冰雪|bīng xuě', '城市|城市|chéng shì',
  '獅子|狮子|shī zi', '老虎|老虎|lǎo hǔ', '大象|大象|dà xiàng', '企鵝|企鹅|qǐ é',
  '兔子|兔子|tù zi', '狐狸|狐狸|hú li', '蝴蝶|蝴蝶|hú dié', '海豚|海豚|hǎi tún',
  '奔跑|奔跑|bēn pǎo', '跳躍|跳跃|tiào yuè', '游泳|游泳|yóu yǒng', '飛翔|飞翔|fēi xiáng',
  '思考|思考|sī kǎo', '探索|探索|tàn suǒ', '尋找|寻找|xún zhǎo', '發現|发现|fā xiàn',
  '憤怒|愤怒|fèn nù', '驚訝|惊讶|jīng yà', '恐懼|恐惧|kǒng jù', '激動|激动|jī dòng',
  '幸福|幸福|xìng fú', '孤獨|孤独|gū dú', '期待|期待|qī dài', '絕望|绝望|jué wàng',
  // HSK / daily expand
  '你好|你好|nǐ hǎo', '謝謝|谢谢|xiè xie', '對不起|对不起|duì bu qǐ', '再見|再见|zài jiàn',
  '早上|早上|zǎo shang', '晚上|晚上|wǎn shang', '今天|今天|jīn tiān', '明天|明天|míng tiān',
  '昨天|昨天|zuó tiān', '現在|现在|xiàn zài', '以後|以后|yǐ hòu', '以前|以前|yǐ qián',
  '爸爸|爸爸|bà ba', '媽媽|妈妈|mā ma', '哥哥|哥哥|gē ge', '姐姐|姐姐|jiě jie',
  '弟弟|弟弟|dì di', '妹妹|妹妹|mèi mei', '老師|老师|lǎo shī', '學生|学生|xué sheng',
  '醫生|医生|yī shēng', '朋友|朋友|péng you', '工作|工作|gōng zuò', '公司|公司|gōng sī',
  '會議|会议|huì yì', '客戶|客户|kè hù', '產品|产品|chǎn pǐn', '服務|服务|fú wù',
  '問題|问题|wèn tí', '答案|答案|dá àn', '辦法|办法|bàn fǎ', '機會|机会|jī huì',
  '計劃|计划|jì huà', '目標|目标|mù biāo', '成功|成功|chéng gōng', '失敗|失败|shī bài',
  '開始|开始|kāi shǐ', '結束|结束|jié shù', '繼續|继续|jì xù', '停止|停止|tíng zhǐ',
  '喜歡|喜欢|xǐ huan', '討厭|讨厌|tǎo yàn', '需要|需要|xū yào', '想要|想要|xiǎng yào',
  '可以|可以|kě yǐ', '應該|应该|yīng gāi', '必須|必须|bì xū', '可能|可能|kě néng',
  '因為|因为|yīn wèi', '所以|所以|suǒ yǐ', '但是|但是|dàn shì', '雖然|虽然|suī rán',
  '如果|如果|rú guǒ', '或者|或者|huò zhě', '還是|还是|hái shi', '已經|已经|yǐ jīng',
  '正在|正在|zhèng zài', '一直|一直|yī zhí', '經常|经常|jīng cháng', '從來|从来|cóng lái',
  '非常|非常|fēi cháng', '特別|特别|tè bié', '比較|比较|bǐ jiào', '完全|完全|wán quán',
  '自己|自己|zì jǐ', '別人|别人|bié ren', '大家|大家|dà jiā', '什麼|什么|shén me',
  '哪裡|哪里|nǎ lǐ', '怎麼|怎么|zěn me', '為什麼|为什么|wèi shén me', '多少|多少|duō shao',
  '中國|中国|zhōng guó', '香港|香港|xiāng gǎng', '台灣|台湾|tái wān', '北京|北京|běi jīng',
  '上海|上海|shàng hǎi', '廣州|广州|guǎng zhōu', '深圳|深圳|shēn zhèn', '語言|语言|yǔ yán',
  '普通話|普通话|pǔ tōng huà', '廣東話|广东话|guǎng dōng huà', '英語|英语|yīng yǔ', '拼音|拼音|pīn yīn',
  '漢字|汉字|hàn zì', '簡體|简体|jiǎn tǐ', '繁體|繁体|fán tǐ', '發音|发音|fā yīn',
  '聲調|声调|shēng diào', '聲母|声母|shēng mǔ', '韻母|韵母|yùn mǔ', '練習|练习|liàn xí',
  '考試|考试|kǎo shì', '作業|作业|zuò yè', '功課|功课|gōng kè', '成績|成绩|chéng jì',
  '進步|进步|jìn bù', '錯誤|错误|cuò wù', '正確|正确|zhèng què', '認真|认真|rèn zhēn',
  '天氣|天气|tiān qì', '下雨|下雨|xià yǔ', '下雪|下雪|xià xuě', '晴天|晴天|qíng tiān',
  '陰天|阴天|yīn tiān', '春天|春天|chūn tiān', '夏天|夏天|xià tiān', '秋天|秋天|qiū tiān',
  '冬天|冬天|dōng tiān', '溫度|温度|wēn dù', '空氣|空气|kōng qì', '陽光|阳光|yáng guāng',
  '水果|水果|shuǐ guǒ', '香蕉|香蕉|xiāng jiāo', '西瓜|西瓜|xī guā', '草莓|草莓|cǎo méi',
  '葡萄|葡萄|pú tao', '橙子|橙子|chéng zi', '檸檬|柠檬|níng méng', '芒果|芒果|máng guǒ',
  '米飯|米饭|mǐ fàn', '麵條|面条|miàn tiáo', '餃子|饺子|jiǎo zi', '包子|包子|bāo zi',
  '牛奶|牛奶|niú nǎi', '咖啡|咖啡|kā fēi', '茶葉|茶叶|chá yè', '果汁|果汁|guǒ zhī',
  '蔬菜|蔬菜|shū cài', '雞肉|鸡肉|jī ròu', '牛肉|牛肉|niú ròu', '豬肉|猪肉|zhū ròu',
  '早餐|早餐|zǎo cān', '午餐|午餐|wǔ cān', '晚餐|晚餐|wǎn cān', '零食|零食|líng shí',
  '火車|火车|huǒ chē', '地鐵|地铁|dì tiě', '公車|公车|gōng chē', '計程車|计程车|jì chéng chē',
  '飛機|飞机|fēi jī', '輪船|轮船|lún chuán', '自行車|自行车|zì xíng chē', '摩托車|摩托车|mó tuō chē',
  '車站|车站|chē zhàn', '票價|票价|piào jià', '護照|护照|hù zhào', '旅行|旅行|lǚ xíng',
  '酒店|酒店|jiǔ diàn', '餐廳|餐厅|cān tīng', '超市|超市|chāo shì', '市場|市场|shì chǎng',
  '醫院|医院|yī yuàn', '藥房|药房|yào fáng', '銀行|银行|yín háng', '郵局|邮局|yóu jú',
  '公園|公园|gōng yuán', '圖書館|图书馆|tú shū guǎn', '博物館|博物馆|bó wù guǎn', '電影院|电影院|diàn yǐng yuàn',
  '運動|运动|yùn dòng', '足球|足球|zú qiú', '籃球|篮球|lán qiú', '網球|网球|wǎng qiú',
  '跑步|跑步|pǎo bù', '健身|健身|jiàn shēn', '瑜伽|瑜伽|yú jiā', '爬山|爬山|pá shān',
  '健康|健康|jiàn kāng', '感冒|感冒|gǎn mào', '發燒|发烧|fā shāo', '咳嗽|咳嗽|ké sou',
  '休息|休息|xiū xi', '睡眠|睡眠|shuì mián', '運動會|运动会|yùn dòng huì', '比賽|比赛|bǐ sài',
  '顏色|颜色|yán sè', '紅色|红色|hóng sè', '藍色|蓝色|lán sè', '綠色|绿色|lǜ sè',
  '黃色|黄色|huáng sè', '黑色|黑色|hēi sè', '白色|白色|bái sè', '紫色|紫色|zǐ sè',
  '數字|数字|shù zì', '第一|第一|dì yī', '第二|第二|dì èr', '第三|第三|dì sān',
  '左邊|左边|zuǒ biān', '右邊|右边|yòu biān', '上面|上面|shàng miàn', '下面|下面|xià miàn',
  '前面|前面|qián miàn', '後面|后面|hòu miàn', '裡面|里面|lǐ miàn', '外面|外面|wài miàn',
  '打開|打开|dǎ kāi', '關閉|关闭|guān bì', '進入|进入|jìn rù', '離開|离开|lí kāi',
  '幫助|帮助|bāng zhù', '請問|请问|qǐng wèn', '麻煩|麻烦|má fan', '客氣|客气|kè qi',
  '開心|开心|kāi xīn', '難過|难过|nán guò', '緊張|紧张|jǐn zhāng', '放鬆|放松|fàng sōng',
  '安靜|安静|ān jìng', '吵鬧|吵闹|chǎo nào', '安全|安全|ān quán', '危險|危险|wēi xiǎn',
  '容易|容易|róng yì', '困難|困难|kùn nan', '簡單|简单|jiǎn dān', '複雜|复杂|fù zá',
  '重要|重要|zhòng yào', '有趣|有趣|yǒu qù', '無聊|无聊|wú liáo', '精彩|精彩|jīng cǎi',
  '漂亮|漂亮|piào liang', '醜陋|丑陋|chǒu lòu', '乾淨|干净|gān jìng', '骯髒|肮脏|āng zāng',
  '年輕|年轻|nián qīng', '年老|年老|nián lǎo', '高大|高大|gāo dà', '矮小|矮小|ǎi xiǎo',
  '快速|快速|kuài sù', '緩慢|缓慢|huǎn màn', '明亮|明亮|míng liàng', '黑暗|黑暗|hēi àn',
  '春天|春天|chūn tiān', '風景|风景|fēng jǐng', '照片|照片|zhào piàn', '相機|相机|xiàng jī',
  '電影|电影|diàn yǐng', '電視|电视|diàn shì', '新聞|新闻|xīn wén', '故事|故事|gù shi',
  '小說|小说|xiǎo shuō', '詩歌|诗歌|shī gē', '歌曲|歌曲|gē qǔ', '舞蹈|舞蹈|wǔ dǎo',
  '繪畫|绘画|huì huà', '攝影|摄影|shè yǐng', '設計|设计|shè jì', '創造|创造|chuàng zào',
  '創新|创新|chuàng xīn', '未來|未来|wèi lái', '過去|过去|guò qù', '回憶|回忆|huí yì',
  '夢想|梦想|mèng xiǎng', '現實|现实|xiàn shí', '理想|理想|lǐ xiǎng', '人生|人生|rén shēng',
  '家庭|家庭|jiā tíng', '孩子|孩子|hái zi', '父母|父母|fù mǔ', '親戚|亲戚|qīn qi',
  '鄰居|邻居|lín jū', '同事|同事|tóng shì', '同學|同学|tóng xué', '陌生人|陌生人|mò shēng rén',
  '禮貌|礼貌|lǐ mào', '尊重|尊重|zūn zhòng', '信任|信任|xìn rèn', '誠實|诚实|chéng shí',
  '勇氣|勇气|yǒng qì', '耐心|耐心|nài xīn', '責任|责任|zé rèn', '義務|义务|yì wù',
  '權利|权利|quán lì', '法律|法律|fǎ lǜ', '規則|规则|guī zé', '秩序|秩序|zhì xù',
  '和平|和平|hé píng', '戰爭|战争|zhàn zhēng', '合作|合作|hé zuò', '競爭|竞争|jìng zhēng',
  '發展|发展|fā zhǎn', '改變|改变|gǎi biàn', '成長|成长|chéng zhǎng', '教育|教育|jiào yù',
  '研究|研究|yán jiū', '實驗|实验|shí yàn', '數據|数据|shù jù', '資訊|资讯|zī xùn',
  '網絡|网络|wǎng luò', '網站|网站|wǎng zhàn', '軟件|软件|ruǎn jiàn', '硬件|硬件|yìng jiàn',
  '密碼|密码|mì mǎ', '帳號|账号|zhàng hào', '下載|下载|xià zǎi', '上傳|上传|shàng chuán',
  '分享|分享|fēn xiǎng', '收藏|收藏|shōu cáng', '刪除|删除|shān chú', '更新|更新|gēng xīn',
  '通知|通知|tōng zhī', '訊息|讯息|xùn xī', '郵件|邮件|yóu jiàn', '電話|电话|diàn huà',
  '微信|微信|wēi xìn', '視訊|视讯|shì xùn', '直播|直播|zhí bō', '短片|短片|duǎn piàn',
  '購物|购物|gòu wù', '折扣|折扣|zhé kòu', '價格|价格|jià gé', '便宜|便宜|pián yi',
  '昂貴|昂贵|áng guì', '品質|品质|pǐn zhì', '品牌|品牌|pǐn pái', '廣告|广告|guǎng gào',
  '發票|发票|fā piào', '收據|收据|shōu jù', '付款|付款|fù kuǎn', '退款|退款|tuì kuǎn',
  '快遞|快递|kuài dì', '包裹|包裹|bāo guǒ', '地址|地址|dì zhǐ', '郵遞區號|邮递区号|yóu dì qū hào',
  '季節|季节|jì jié', '節日|节日|jié rì', '生日|生日|shēng rì', '婚禮|婚礼|hūn lǐ',
  '聚會|聚会|jù huì', '派對|派对|pài duì', '禮物|礼物|lǐ wù', '祝福|祝福|zhù fú',
  '恭喜|恭喜|gōng xǐ', '慶祝|庆祝|qìng zhù', '紀念|纪念|jì niàn', '傳統|传统|chuán tǒng',
  '習慣|习惯|xí guàn', '風俗|风俗|fēng sú', '信仰|信仰|xìn yǎng', '哲學|哲学|zhé xué',
  '心理|心理|xīn lǐ', '情緒|情绪|qíng xù', '感覺|感觉|gǎn jué', '意識|意识|yì shí',
  '注意力|注意力|zhù yì lì', '記憶力|记忆力|jì yì lì', '想像力|想象力|xiǎng xiàng lì', '創造力|创造力|chuàng zào lì',
  '壓力|压力|yā lì', '焦慮|焦虑|jiāo lǜ', '平靜|平静|píng jìng', '自信|自信|zì xìn',
  '自尊|自尊|zì zūn', '謙虛|谦虚|qiān xū', '驕傲|骄傲|jiāo ào', '嫉妒|嫉妒|jí dù',
  '寬恕|宽恕|kuān shù', '感謝|感谢|gǎn xiè', '道歉|道歉|dào qiàn', '原諒|原谅|yuán liàng',
  '擁抱|拥抱|yōng bào', '微笑|微笑|wēi xiào', '眼淚|眼泪|yǎn lèi', '笑聲|笑声|xiào shēng',
  '握手|握手|wò shǒu', '點頭|点头|diǎn tóu', '揮手|挥手|huī shǒu', '鼓掌|鼓掌|gǔ zhǎng',
  '站立|站立|zhàn lì', '坐下|坐下|zuò xia', '躺下|躺下|tǎng xia', '起床|起床|qǐ chuáng',
  '刷牙|刷牙|shuā yá', '洗澡|洗澡|xǐ zǎo', '洗臉|洗脸|xǐ liǎn', '梳頭|梳头|shū tóu',
  '穿衣|穿衣|chuān yī', '脫鞋|脱鞋|tuō xié', '出門|出门|chū mén', '回家|回家|huí jiā',
  '上班|上班|shàng bān', '下班|下班|xià bān', '加班|加班|jiā bān', '請假|请假|qǐng jià',
  '開會|开会|kāi huì', '報告|报告|bào gào', '簡報|简报|jiǎn bào', '討論|讨论|tǎo lùn',
  '建議|建议|jiàn yì', '意見|意见|yì jiàn', '同意|同意|tóng yì', '反對|反对|fǎn duì',
  '妥協|妥协|tuǒ xié', '談判|谈判|tán pàn', '簽約|签约|qiān yuē', '合約|合约|hé yuē',
  '預算|预算|yù suàn', '成本|成本|chéng běn', '利潤|利润|lì rùn', '投資|投资|tóu zī',
  '股票|股票|gǔ piào', '基金|基金|jī jīn', '保險|保险|bǎo xiǎn', '稅務|税务|shuì wù',
  '薪水|薪水|xīn shuǐ', '獎金|奖金|jiǎng jīn', '退休|退休|tuì xiū', '失業|失业|shī yè',
  '求職|求职|qiú zhí', '面試|面试|miàn shì', '履歷|履历|lǚ lì', '推薦|推荐|tuī jiàn',
  '升職|升职|shēng zhí', '調職|调职|diào zhí', '離職|离职|lí zhí', '辭職|辞职|cí zhí',
  '團隊|团队|tuán duì', '領導|领导|lǐng dǎo', '管理|管理|guǎn lǐ', '執行|执行|zhí xíng',
  '效率|效率|xiào lǜ', '品質|品质|pǐn zhì', '標準|标准|biāo zhǔn', '流程|流程|liú chéng',
  '策略|策略|cè lüè', '分析|分析|fēn xī', '總結|总结|zǒng jié', '評估|评估|píng gū',
  '風險|风险|fēng xiǎn', '機會|机会|jī huì', '優勢|优势|yōu shì', '劣勢|劣势|liè shì',
  '挑戰|挑战|tiǎo zhàn', '困難|困难|kùn nan', '解決|解决|jiě jué', '完成|完成|wán chéng',
];

function dedupe(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    const hanzi = entry.split('|')[0];
    if (seen.has(hanzi)) continue;
    seen.add(hanzi);
    out.push(entry);
  }
  return out;
}

export const DEFAULT_DICTIONARY = dedupe(RAW_WORDS);

export function parseWord(rawString: string): WordEntry {
  const parts = rawString.split('|');
  if (parts.length >= 3) {
    return { hanzi: parts[0], sim: parts[1], pinyin: parts[2] };
  }
  return { hanzi: parts[0], sim: parts[0], pinyin: parts[1] || '' };
}

export function getWordByIndex(dictionary: string[], index: number): WordEntry {
  if (dictionary.length === 0) {
    return { hanzi: '—', sim: '—', pinyin: '' };
  }
  return parseWord(dictionary[((index % dictionary.length) + dictionary.length) % dictionary.length]);
}
