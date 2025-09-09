// abusiveWords.js
export const abusiveWords = {
    en: [
        // Basic profanity
        'fuck', 'shit', 'bitch', 'ass', 'damn', 'hell', 'crap', 'piss',
        'bastard', 'asshole', 'dickhead', 'motherfucker', 'cocksucker',
        'whore', 'slut', 'cunt', 'dick', 'cock', 'pussy', 'tits', 'boobs',
        'nigger', 'faggot', 'retard', 'gay', 'homo', 'lesbian', 'tranny',
        // Variations and euphemisms
        'wtf', 'stfu', 'gtfo', 'omfg', 'fml', 'pos', 'sob', 'mofo',
        'fck', 'fuk', 'sh1t', 'b1tch', 'a55', 'a$$', '@$$', 'f*ck',
        'sh*t', 'b*tch', 'f**k', 'a**', 'damn', 'dammit', 'goddamn',
        // Internet slang
        'thot', 'simp', 'incel', 'chad', 'karen', 'boomer'
      ],
      
      // Tamil and Thanglish
      ta: [
        // Tamil script
        'புண்ட', 'தேவடி', 'ஒழி', 'கேவல', 'மடையன்', 'கெட்டவன்', 'முட்டாள்',
        'பைத்தியம்', 'நாய்', 'பன்னி', 'கழுதை', 'போடா', 'போடி', 'சூத்', 'கூதி',
        'வேசி', 'ரண்டி', 'பூல்', 'கூதிய', 'ஓக்க', 'ஓம்மல', 'தாயோளி',
        // Thanglish (Tamil in English)
        'punda', 'thevidiya', 'thevidya', 'ozi', 'keval', 'madayan', 'kettavan',
        'muttal', 'paithiyam', 'nai', 'naai', 'panni', 'kazhuthai', 'kazhuta',
        'poda', 'podi', 'soothu', 'koothi', 'kuthhi', 'vesi', 'randi',
        'pool', 'kootiya', 'okka', 'ommal', 'tayoli', 'dei', 'di',
        'enna da', 'enna di', 'po da', 'po di'
      ],
      
      // Hindi and Hinglish
      hi: [
        // Devanagari script
        'चूतिया', 'मादरचोद', 'भोसड़ी', 'कुत्ता', 'हरामी', 'गधा', 'रंडी',
        'साला', 'कमीना', 'बदमाश', 'लौड़ा', 'गांडू', 'भेनचोद', 'बहनचोद',
        'तेरी मा', 'माकी चूत', 'गाली', 'कुत्ती', 'सुअर', 'हरामजादा',
        // Hinglish (Hindi in English)
        'chutiya', 'chutia', 'madarchod', 'mc', 'bc', 'bhosadi', 'bhosda',
        'kutta', 'kutti', 'harami', 'haramzada', 'gadha', 'gadhi',
        'randi', 'saala', 'sala', 'kameena', 'kamine', 'badmaash', 'badmash',
        'lauda', 'loda', 'gandu', 'gando', 'bhenchodd', 'behenchod',
        'teri maa', 'tere baap', 'maa ki chut', 'baap', 'bhen'
      ],
      
      // Telugu and transliterated
      te: [
        // Telugu script
        'బూతు', 'దెంగు', 'పూకు', 'లంజ', 'గాడిద', 'కుక్క', 'పిచ్చి',
        'మూర్ఖుడు', 'వేధవ', 'దుష్టుడు', 'కొట్టు', 'తిట్టు', 'చచ్చిపో',
        // Transliterated
        'boothu', 'dengu', 'pooku', 'puku', 'lanja', 'gaadida', 'kukka',
        'picchi', 'moorkhuddu', 'vedhava', 'dushtuddu', 'kottu', 'tittu',
        'chachchipo', 'dengey', 'dengutha'
      ],
      
      // Malayalam and transliterated
      ml: [
        // Malayalam script
        'പട്ടി', 'പന്നി', 'കഴുത', 'മൂര്‍ഖന്‍', 'ദുഷ്ടന്‍', 'ചെത്ത',
        'തെണ്ടി', 'പൂറി', 'കുണ്ണ', 'മൈര്', 'പൂര്', 'തായോളി',
        // Transliterated
        'patti', 'panni', 'kazhuta', 'moorkhan', 'dushtan', 'chettha',
        'thendi', 'poori', 'kunna', 'myru', 'mayru', 'poor', 'tayoli'
      ],
      
      // Kannada and transliterated
      kn: [
        // Kannada script
        'ಕೆಟ್ಟವ', 'ಮೂರ್ಖ', 'ನಾಯಿ', 'ಹುಚ್ಚ', 'ದುಷ್ಟ', 'ಗಧೆ',
        'ಹಂದಿ', 'ಕಳ್ಳ', 'ಬೂತು', 'ತುಲ್ಲು', 'ಕುಣ್ಣ', 'ಮೈರು',
        // Transliterated
        'kettava', 'moorka', 'nayi', 'huccha', 'dushta', 'gadhe',
        'handi', 'kalla', 'boothu', 'tullu', 'kunna', 'mayru'
      ],
      
      // Bengali and transliterated
      bn: [
        // Bengali script
        'শূকর', 'কুত্তা', 'গাধা', 'বদমাশ', 'হারামি', 'মাগি', 'রেন্ডি',
        'চোদা', 'ভোদা', 'বেশ্যা', 'খানকি', 'হারামজাদা', 'কুত্তার বাচ্চা',
        // Transliterated
        'shukor', 'kutta', 'gadha', 'badmash', 'harami', 'magi', 'rendi',
        'choda', 'voda', 'beshya', 'khanki', 'haramjada', 'kuttar baccha'
      ]
};
