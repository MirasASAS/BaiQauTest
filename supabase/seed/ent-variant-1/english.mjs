import { S, C, M, T } from './_lib.mjs';

// Задания по английскому языку даются на английском, поэтому казахского перевода у них нет.
const gap = (topic, sentence, options, key) => S(topic, `Choose the correct option.\n${sentence}`, null, options, null, key);

export default {
  passages: {
    astana: {
      title: 'Astana',
      ru: 'Astana became the capital of Kazakhstan in 1997. The city stands on the banks of the Ishim River in the north of the country and is known for its modern architecture. One of its symbols is the Baiterek tower, which is 97 metres high — the number reminds people of the year when the city became the capital. Winters in Astana are very cold: the temperature can fall below minus 30 degrees, which makes it one of the coldest capital cities in the world. In 2017 the city hosted the international exhibition EXPO, whose theme was "Future Energy".',
      kz: null,
    },
  },
  questions: [
    gap('Present Simple', 'She ___ to school every day.', ['go', 'goes', 'going', 'gone'], 'B'),
    gap('Present Continuous', 'Look! They ___ football in the yard now.', ['are playing', 'play', 'plays', 'played'], 'A'),
    gap('Past Simple', 'I ___ this film yesterday.', ['watch', 'have watched', 'watched', 'am watching'], 'C'),
    gap('Present Perfect', 'He has ___ finished his homework.', ['yet', 'ago', 'yesterday', 'already'], 'D'),
    gap('Условные предложения', 'If it rains tomorrow, we ___ at home.', ['stayed', 'will stay', 'would stay', 'stay'], 'B'),
    gap('Условные предложения', 'If I ___ rich, I would travel around the world.', ['were', 'am', 'will be', 'have been'], 'A'),
    gap('Степени сравнения', 'This book is ___ than that one.', ['interesting', 'most interesting', 'more interesting', 'the most interesting'], 'C'),
    gap('Степени сравнения', 'Everest is ___ mountain in the world.', ['high', 'higher', 'more high', 'the highest'], 'D'),
    gap('Количественные местоимения', "There isn't ___ milk in the fridge.", ['some', 'any', 'many', 'a few'], 'B'),
    gap('Количественные местоимения', 'How ___ students are there in your class?', ['many', 'much', 'little', 'any'], 'A'),
    gap('Страдательный залог', 'The letter ___ by Tom yesterday.', ['wrote', 'is written', 'was written', 'has written'], 'C'),
    gap('Косвенная речь', 'She said that she ___ tired.', ['is', 'will be', 'has been', 'was'], 'D'),
    gap('Герундий и инфинитив', "I'm looking forward to ___ you soon.", ['see', 'seeing', 'saw', 'seen'], 'B'),
    gap('Предлоги', 'He is good ___ maths.', ['at', 'in', 'on', 'with'], 'A'),
    gap('Предлоги', 'We have lived in this house ___ 2015.', ['for', 'from', 'since', 'during'], 'C'),
    gap('Модальные глаголы', "You ___ smoke here. It's forbidden.", ["don't have to", 'needn\'t', 'may', "mustn't"], 'D'),
    gap('Present Perfect', '___ you ever been to London?', ['Did', 'Have', 'Are', 'Do'], 'B'),
    gap('Придаточные предложения', 'This is the man ___ lives next door.', ['who', 'which', 'whose', 'where'], 'A'),
    gap('Past Perfect', 'By the time we arrived, the film ___.', ['starts', 'has started', 'had started', 'is starting'], 'C'),
    gap('Разделительные вопросы', 'She can speak English, ___?', ['does she', 'can she', "isn't she", "can't she"], 'D'),
    gap('Present Perfect', "I ___ my keys. I can't find them anywhere.", ['lose', 'have lost', 'was losing', 'had lost'], 'B'),
    S('Лексика', 'Choose the synonym of the word "big".', null, ['large', 'tiny', 'narrow', 'weak'], null, 'A'),
    S('Лексика', 'Choose the antonym of the word "cheap".', null, ['poor', 'free', 'expensive', 'easy'], null, 'C'),
    S('Множественное число', 'Choose the plural form of the noun "child".', null, ['childs', 'childes', 'childrens', 'children'], null, 'D'),
    S('Лексика', 'Choose the word that does NOT belong to the group.', null, ['apple', 'carrot', 'banana', 'orange'], null, 'B'),

    C('astana', 'Чтение', 'When did Astana become the capital of Kazakhstan?', null, ['In 1991', 'In 2017', 'In 1997', 'In 1930'], null, 'C'),
    C('astana', 'Чтение', 'Why is the Baiterek tower 97 metres high?', null,
      ['The number reminds people of the year when the city became the capital', 'It is the height of the tallest tree in Kazakhstan', 'It was built in 97 days', 'There are 97 floors in the tower'], null, 'A'),
    C('astana', 'Чтение', 'Which statement is true according to the text?', null,
      ['Astana is in the south of Kazakhstan', 'Astana is famous for its ancient buildings', 'Winters in Astana are mild', 'Astana is one of the coldest capital cities in the world'], null, 'D'),
    C('astana', 'Чтение', 'What was the theme of EXPO 2017?', null, ['Modern Architecture', 'Future Energy', 'Clean Water', 'Smart Cities'], null, 'B'),
    C('astana', 'Чтение', 'The word "hosted" in the text is closest in meaning to …', null, ['visited', 'missed', 'held', 'cancelled'], null, 'C'),

    T('Лексика', 'Match the job with its definition.', null,
      [['a doctor', null, 'C'], ['a pilot', null, 'A']], ['a person who flies planes', 'a person who cooks food', 'a person who treats sick people', 'a person who teaches children'], null),
    T('Неправильные глаголы', 'Match the verb with its Past Simple form.', null,
      [['go', null, 'C'], ['buy', null, 'A']], ['bought', 'gone', 'went', 'buyed'], null),
    T('Времена глагола', 'Match the sentence with its tense.', null,
      [['She is reading a book.', null, 'C'], ['She has read the book.', null, 'A']], ['Present Perfect', 'Past Simple', 'Present Continuous', 'Future Simple'], null),
    T('Страноведение', 'Match the country with its capital.', null,
      [['the United Kingdom', null, 'D'], ['the USA', null, 'A']], ['Washington, D.C.', 'New York', 'Sydney', 'London'], null),
    T('Лексика', 'Match the adjective with its opposite.', null,
      [['early', null, 'C'], ['noisy', null, 'A']], ['quiet', 'fast', 'late', 'heavy'], null),

    M('Неправильные глаголы', 'Choose the irregular verbs.', null, ['play', 'go', 'work', 'take', 'watch', 'write'], null, 'BDF'),
    M('Существительные', 'Choose the uncountable nouns.', null, ['water', 'apple', 'information', 'chair', 'money', 'book'], null, 'ACE'),
    M('Грамматика', 'Choose the grammatically correct sentences.', null,
      ["She doesn't like coffee.", "He don't like tea.", 'We were at school.', 'They was at home.', 'I am agree with you.', 'Does he play chess?'], null, 'ACF'),
    M('Части речи', 'Choose the adverbs.', null, ['quickly', 'beautiful', 'happy', 'slowly', 'friend', 'well'], null, 'ADF'),
    M('Страноведение', 'Choose the countries where English is the main language.', null, ['Brazil', 'Australia', 'Canada', 'Egypt', 'Japan', 'New Zealand'], null, 'BCF'),
  ],
};
