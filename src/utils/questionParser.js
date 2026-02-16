export const parseQuestionsFromText = (text) => {

  const mcqQuestions = [];
  const editableQuestions = [];

  // Remove extra spaces
  const cleanText = text.replace(/\s+/g, " ");

  // Match Q + Number + Answer Text
  // Example: Q21 Were cycling
  const regex = /Q(\d+)\s([A-Za-z ,.'$]+)/g;

  let match;

  while ((match = regex.exec(cleanText)) !== null) {

    const questionNumber = match[1];
    const answerText = match[2].trim();

    // If sentence → editable question
    if (answerText.split(" ").length > 3) {
      editableQuestions.push({
        question_no: questionNumber,
        sentence: answerText,
        correct_word: answerText
      });
    } else {
      // Otherwise treat as word answer MCQ type
      mcqQuestions.push({
        question_no: questionNumber,
        answer: answerText
      });
    }
  }

  return {
    mcqQuestions,
    editableQuestions
  };
};
