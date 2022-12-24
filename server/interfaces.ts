export type GuessSelection = 'left' | 'right';

export interface IQuestion {
    question: string;
    left: string;
    right: string;
    answer: string;
    id: string;
}

export interface ISubmission {
    game: string;
    name: string;
    guesses: IGuessDict;
}

export interface IState {
    open: boolean
}

export interface IQuiz {
    id: number;
    name: string;
    guesses: IGuessDict; 
}

export interface IGuessDict {
    // question_id to response
    [index: string]: GuessSelection;
}
