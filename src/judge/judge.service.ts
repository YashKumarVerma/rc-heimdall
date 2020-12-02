import * as config from 'config';
import { ProblemsService } from 'src/problems/problems.service';
import { TeamsService } from 'src/teams/teams.service';

import { BadRequestException, Dependencies, HttpService, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { CallbackJudgeDto } from './dto/callback-judge.dto';
import { CreateJudgeDto } from './dto/create-judge.dto';
import { UpdateJudgeDto } from './dto/update-judge.dto';
import { CODE_STATES, CodeStates } from './enum/codeStates.enum';
import { LanguageStruct } from './interface/enums.interface';
import { JudgeOSubmissionRequest } from './interface/judge0.interfaces';
import { JudgeRepository } from './judge.repository';
import { mapLanguageStringToObject } from './minions/language';

@Injectable()
@Dependencies(HttpService)
export class JudgeService {
  constructor(
    private readonly http: HttpService,
    private readonly endpoint: string,
    private readonly callbackURL: string,
    private readonly logger = new Logger('judge'),

    @InjectRepository(JudgeRepository)
    private readonly judgeRepository: JudgeRepository,

    @Inject(ProblemsService)
    private readonly problemService: ProblemsService,

    @Inject(TeamsService)
    private readonly teamService: TeamsService,
  ) {
    this.logger.verbose('service initialized');
    this.callbackURL = config.get('judge.callback');
    this.endpoint = `${config.get('judge.endpoint')}/submissions?base64_encoded=true`;
  }

  async create(createJudgeDto: CreateJudgeDto) {
    const { code, language, problemID, teamID } = createJudgeDto;

    /** map code extension to judge0 specific id */
    const codeLanguage: LanguageStruct = mapLanguageStringToObject(language);
    if (codeLanguage.id === -1) {
      throw new BadRequestException('Code language not accepted');
    }

    /** fetch question details about question */
    const problem = await this.problemService.findOneForJudge(problemID);
    if (problem === undefined) {
      throw new BadRequestException(`No problem with id:${problemID}`);
    }

    /** fetch team details to ensure that it's not a random submission */
    const team = await this.teamService.findOneById(teamID);
    if (team === undefined) {
      throw new BadRequestException(`No team with id:${teamID}`);
    }

    const postBody: JudgeOSubmissionRequest = {
      source_code: code,
      language_id: codeLanguage.id,
      callback_url: this.callbackURL,
      expected_output: Buffer.from(problem.outputText).toString('base64'),
      stdin: Buffer.from(problem.inputText).toString('base64'),
    };
    console.log(postBody);

    const { data } = await this.http.post(this.endpoint, postBody).toPromise();
    const judge0ID = data.token;

    /** save the submission into database */
    const judge0Submission = this.judgeRepository.save({
      problem,
      team,
      language: codeLanguage.id,
      state: CodeStates.IN_QUEUE,
      points: 0,
      judge0ID,
      code,
    });

    return judge0Submission;
  }

  async handleCallback(callbackJudgeDto: CallbackJudgeDto) {
    const { status, stdout, token } = callbackJudgeDto;

    /** update state of submission in database */
    const submission = await this.judgeRepository.fetchDetailsByJudge0Token(token);
    submission.state = CODE_STATES[status.id - 1];
    await submission.save;
    return { updated: true };
  }

  findAll() {
    return this.judgeRepository.find();
  }

  findOne(id: number) {
    return this.judgeRepository.findOne(id);
  }

  /** not exposed to api, provisioned for internal use only */
  update(id: number, updateJudgeDto: UpdateJudgeDto) {
    return `This action updates a #${id} judge`;
  }

  /** not exposed to api, provisioned for internal use only */
  remove(id: number) {
    return `This action removes a #${id} judge`;
  }
}
