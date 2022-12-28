import express, { Request, Response } from 'express';
import { Client as PgClient, QueryResult } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { GetAllQuizzes, GetQuestions, GetState, RankAllPlayers, ValidateGame} from './helpers';
import { IQuestion, ISubmission as ISubmission, IState, IQuiz } from 'interfaces';

dotenv.config({path: path.join(__dirname, '../../.env')});
const app = express();
const PORT = process.env.WEB_PORT;

app.use(express.static(path.join(__dirname, '../../client/dist')));
app.get('/client/*', (request: Request, response : Response) => response.sendFile(path.join(__dirname, '../../client/dist/index.html')));
app.use(express.json());
app.use(express.urlencoded( { extended: true } ));

const pgClient = new PgClient({
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: Number(process.env.PGPORT)
});
pgClient.connect();

// Get questions from server - returns IQuestion[]
app.get('/api/questions', async (request : Request, response : Response) => {
  const questions = GetQuestions();
  response.json(questions);
});

// Add quiz to the database - returns nothing
app.post('/api/submission', async (request : Request, response : Response) => {
  const body : ISubmission = request.body;
  const game = body.game;
  const isValid = ValidateGame(game);
  if (!isValid) {
    console.error(`Invalid game '${game}'`)
    response.status(400);
    return;
  }

  // Check if quiz is open
  const state : IState = GetState();
  const open = state.open;
  if (!open) {
    console.error("The submitted quiz with the name '" + body.name + "' was rejected because the quiz is closed.");
    // TODO: change this redirect - possibly to a 400 bad request and have the client redirect
    // response.redirect(`/scoreboard/index.html?game=${game}&status=failure`);
    return;
  }

  // Insert into quiz table
  let query =  "INSERT INTO quizzes(name, game) \
                VALUES ($1, $2) \
                RETURNING quiz_id";
  let params = [request.body.name, game];
  let result: QueryResult<any> = await pgClient.query(query, params);
  if (result.rows.length != 1) {
    console.error(`There was not exactly one result with quiz_id ${result.rows.length}`);
    response.status(400);
    return;
  }
  const quiz_id = result.rows[0].quiz_id;

  // Insert into guesses table
  const values : any[] = [];
  params = [];
  let paramIndex = 1;
  const questions = GetQuestions();
  questions.forEach((question) => {
    if (body.guesses[question.id]) {
      params.push(question.id);
      params.push(quiz_id);
      params.push(body.guesses[question.id]);
      const valueStr = "($" + paramIndex + ", $" + (paramIndex+1) + ", $" + (paramIndex+2) + ")";
      values.push(valueStr);
      paramIndex += 3;
    } else {
      console.error("Question id '" + question.id + "' does not exist");
    }
  });

  if (values.length > 0) {
    const queryArray = ["INSERT INTO guesses(question_id, quiz_id, guess_value) VALUES"];
    values.forEach((valueStr, index) => {
      queryArray.push(" \n");
      queryArray.push(valueStr);
      if (index < values.length - 1) {
        queryArray.push(",");
      } else {
        queryArray.push(";");
      }
    });
    query = queryArray.join('');
    await pgClient.query(query, params);
    console.log("'" + body.name + "' submitted a quiz");
    response.redirect(`/scoreboard/index.html?game=${game}&status=success`);
  } else {
    console.error("There were no question guesses for quiz_id: '" + quiz_id + "'");
    response.redirect(`/scoreboard/index.html?game=${game}&status=failure`);
  }
});

// TODO: get rid of this (is it used?)
// Get guesses from database - returns IQuiz[]
app.get('/api/quizzes/:game', async (request : Request, response : Response) => {
  const game = request.params.game;
  const isValid = ValidateGame(game);
  if (!isValid) {
    console.error(`Invalid game '${game}'`);
    response.status(400);
    return;
  }
  const data = GetAllQuizzes(pgClient, game);
  response.json(data);
});

// Get guesses from database - returns IPlayerData[]
app.get('/api/ranking/:game', async (request : Request, response : Response) => {
  const game = request.params.game;
  const isValid = ValidateGame(game);
  if (!isValid) {
    console.error(`Invalid game '${game}'`);
    response.status(400);
    return;
  }
  const quizzes = await GetAllQuizzes(pgClient, game);
  const questions = await GetQuestions();
  const rankedPlayerData = RankAllPlayers(questions, quizzes);
  response.json(rankedPlayerData);
});

// returns IQuiz
app.get('/api/quiz/:id', async (request : Request, response : Response) : Promise<void> => {
  const quiz_id = Number(request.params.id);
  // Get name
  let query =  "SELECT name, game \
                FROM quizzes \
                WHERE quiz_id = $1";
  let params : any[] = [quiz_id];
  let result = await pgClient.query(query, params);
  if (result.rows.length != 1) {
    console.error(`There was not exactly one result with quiz_id ${result.rows.length}`);
    response.status(400);
    return;
  }

  const data : IQuiz = { 
    name: result.rows[0].name,
    id: quiz_id,
    guesses: {}
  };

  // get guesses
  query =  "SELECT question_id, guess_value \
            FROM quizzes \
            INNER JOIN guesses \
            ON quizzes.quiz_id = guesses.quiz_id \
            WHERE quizzes.quiz_id = $1";
  params = [quiz_id];
  result = await pgClient.query(query, params);
  result.rows.forEach((row : any) => {
    data.guesses[row.question_id] = row.guess_value;
  });
  response.json(data);
});

// Ask the server if the quiz is open
app.get('/api/quiz-state', (request : Request, response : Response) => {
  const state = GetState();
  response.json(state as IState);
})

app.post('/api/is-valid-game', async (request : Request, response : Response) => {
  const status = ValidateGame(request.body.game);
  response.json({ status });
});

app.get('*', function(req, res){
  res.status(404).send('<p>Page not found</p>');
});

app.listen(PORT, () => console.log('listening on port ' + PORT));
