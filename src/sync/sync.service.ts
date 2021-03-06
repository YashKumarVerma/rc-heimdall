import {
  Dependencies,
  HttpService,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as config from 'config';
import { JudgeService } from 'src/judge/judge.service';
import { ParticipantsService } from 'src/participants/participants.service';
import { ProblemsService } from '../problems/problems.service';
import { ProblemMetadata } from './interface/problem.interface';

/**
 * **Sync  Service**
 *
 * Sync Service contains all logic related to ensure that all micro services share the
 * data and therefore can interact with each other hassle-free.
 *
 * @category Sync
 */
@Injectable()
@Dependencies(HttpService)
export class SyncService {
  constructor(
    /** [[HttpService]] to make HTTP calls to storage lambda endpoint */
    private readonly http: HttpService,

    /** endpoints for API Calls */
    private readonly seeder: string,
    private readonly taskRunner: string,
    private readonly registrationEndpoint: string,

    /** initialize logger with context:seeder */
    private readonly logger = new Logger('seeder'),

    /** inject [[ProblemsService]] to seed data into [[ProblemRepository]]  */
    @Inject(ProblemsService)
    private readonly problemsService: ProblemsService,

    @Inject(ParticipantsService)
    private readonly participantService: ParticipantsService,

    @Inject(JudgeService)
    private readonly judgeService: JudgeService,
  ) {
    this.seeder = config.get('seeder.endpoint');
    this.taskRunner = config.get('runner.seedEndpoint');
    this.registrationEndpoint = config.get('registration.endpoint');
    this.logger.verbose('Sync initialized');
  }

  /**
   * To sync database entries with problems uploaded on cloud storage
   */
  async syncWithCloudStorage() {
    try {
      this.logger.verbose(`connecting to seeding endpoint: ${this.seeder} `);
      const reply = await this.http.get(this.seeder).toPromise();

      if (reply.status !== 200) {
        this.logger.error(`connecting to seeding endpoint: ${this.seeder}`);
        throw new ServiceUnavailableException(`Cannot connect to seeder`);
      }

      /** transform object into array */
      const problems = reply.data.payload;
      this.logger.verbose('Displaying problem details');

      /** save problem details locally and return data as string object */
      const parsedData = await this.saveLocally(problems);

      /** clear old storage */
      const clearOperation = await this.problemsService.clear();
      this.logger.verbose(`Cleared ${clearOperation.affected} from problem storage`);

      parsedData.forEach((problem) => {
        this.problemsService.create({
          name: problem.id,
          maxPoints: 100,
          inputText: problem.inputText,
          outputText: problem.outputText,
          instructionsText: problem.instructionsText,
          inputFileURL: problem.input,
          outputFileURL: problem.output,
          instructionsFileURL: problem.instructions,
          windowsFileURL: problem.windows,
          objectFileURL: problem.object,
          macFileURL: problem.mac,
          multiplier: problem.multiplier ? problem.multiplier : 1,
          sampleInput: problem.sampleInput ? problem.sampleInput : 'sample input',
          sampleOutput: problem.sampleOutput ? problem.sampleOutput : 'sample output',
        });
      });

      this.logger.verbose(`Seeded ${parsedData.length} problems into storage`);

      //   const taskRunnerStatus = await this.pingTaskRunnerToUpdateStorages();
      this.logger.verbose('Pinging task-runner to update storages');

      return parsedData;
    } catch (error) {
      this.logger.error(error);
      throw new InternalServerErrorException('Error seeding', error);
    }
  }

  async syncWithParticipants() {
    try {
      this.logger.verbose(`Updating participant storages`);
      await this.judgeService.clear();
      this.logger.verbose(`cleared judge submissions`);
      await this.participantService.clear();
      this.logger.verbose(`cleared participants list`);

      const { data } = await this.http.get(this.registrationEndpoint).toPromise();
      data.forEach(async (item) => {
        this.logger.verbose(`adding ${item.name} with ${item.googleId}`);
        try {
          await this.participantService.create({
            email: item.email,
            googleID: item.googleId,
            isAdmin: item.isAdmin,
            name: item.name,
            phoneNumber: '9870000000',
            registrationNumber: '19BCE0000',
            teamName: item.teamName,
          });
        } catch (e) {
          this.logger.error(`Error adding ${item.name} / ${item.teamName} / ${item.googleId}`);
        }
      });
      console.log(data.length);
    } catch (e) {
      this.logger.error('Error seeding participants');
    }
  }

  /**
   * Function to shoot a request to task-runner so that it updates it's arsenal of
   * binaries to run code on.
   *
   * The reason that this is not an async function, and we do not care about
   * the reply from the task-runner is that it is not the job of this service to ensure that
   * task-runner does what it is expected to do. The download can take a few minutes which can
   * cause a timeout on some connections. To avoid that, we rely on task-runner to download the
   * files, and just to inform the user, we send a 202 to denote that the request is accepted.
   *
   */
  async pingTaskRunnerToUpdateStorages(): Promise<boolean> {
    try {
      this.logger.verbose(`Pinging task-runner on ${this.taskRunner}`);
      const response = await this.http.get(this.taskRunner).toPromise();
      return [200, 201].includes(response.status);
    } catch (error) {
      this.logger.error('Problem connecting task-runner');
      throw new InternalServerErrorException('Task Runner not responding');
    }
  }

  /**
   * **Save Locally**
   *
   * This method is responsible for making API Calls to the storage lambda, fetch
   * input, output and instruction as plain text.
   */
  private async saveLocally(problems: Array<ProblemMetadata>): Promise<Array<ProblemMetadata>> {
    const tasks: Array<ProblemMetadata> = [];
    for (let i = 0; i < problems.length; i += 1) {
      this.logger.verbose(`Processing id:${problems[i].id}`);
      const inputRequest = this.http.get(problems[i].input, { responseType: 'text' }).toPromise();
      const outputRequest = this.http.get(problems[i].output, { responseType: 'text' }).toPromise();
      const instructionRequest = this.http.get(problems[i].instructions, { responseType: 'text' }).toPromise();
      const sampleInputRequest = this.http.get(problems[i].sampleInput, { responseType: 'text' }).toPromise();
      const sampleOutputRequest = this.http.get(problems[i].sampleOutput, { responseType: 'text' }).toPromise();
      await Promise.all([inputRequest, outputRequest, instructionRequest, sampleInputRequest, sampleOutputRequest])
        .then((response) => {
          tasks.push({
            id: problems[i].id,
            input: problems[i].input,
            output: problems[i].output,
            instructions: problems[i].instructions,
            windows: problems[i].windows,
            object: problems[i].object,
            mac: problems[i].mac,
            inputText: response[0].data,
            outputText: response[1].data,
            instructionsText: response[2].data,
            multiplier: 1,
            sampleInput: response[3].data,
            sampleOutput: response[4].data,
          });
        })
        .catch((error) => {
          this.logger.error('Error fetching problem details', error);
        });
    }
    return tasks;
  }
}
