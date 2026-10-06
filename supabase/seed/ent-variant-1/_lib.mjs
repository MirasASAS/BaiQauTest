// Короткая запись вопросов для первого варианта в формате ЕНТ.
// Текст: ru — основной, kz — казахский (null, если совпадает с основным или не нужен,
// как в заданиях по английскому языку). Варианты ответа: optsKz = null, если они
// одинаковы на обоих языках (числа, формулы, имена собственные).

// Один правильный ответ: key — буква 'A'…'D'
export const S = (topic, ru, kz, optsRu, optsKz, key) => ({ type: 'single', topic, ru, kz, optsRu, optsKz, key });

// Контекстное задание: вопрос с одним ответом к общему тексту (passage — его ключ в passages)
export const C = (passage, topic, ru, kz, optsRu, optsKz, key) => ({ ...S(topic, ru, kz, optsRu, optsKz, key), passage });

// Несколько правильных ответов: шесть вариантов, key — буквы верных, например 'ACE'
export const M = (topic, ru, kz, optsRu, optsKz, key) => ({ type: 'multiple', topic, ru, kz, optsRu, optsKz, key });

// Соответствие: left — [[утверждение ru, утверждение kz | null, буква], …], варианты A–D
export const T = (topic, ru, kz, left, optsRu, optsKz) => ({ type: 'matching', topic, ru, kz, left, optsRu, optsKz });

// Стандартные формулировки заданий на соответствие и с несколькими ответами
export const MATCH_RU = 'Установите соответствие.';
export const MATCH_KZ = 'Сәйкестікті анықтаңыз.';
