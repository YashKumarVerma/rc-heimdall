import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual } from 'typeorm';
import { CreateProblemDto } from './dto/create-problem.dto';
import { ProblemRepository } from './problems.repository';

/**
 * **Problems Service**
 *
 * Problems Service contains all business logic related to problems, and is designed to be
 * imported and re-used in other modules. Therefore it is to ensure that all methods of the service
 * are self-contained and fit to be used directly as per use-case.
 *
 * @category Problems
 */
@Injectable()
export class ProblemsService {
  constructor(
    /** injecting [[ProblemRepository]] as a persistence layer */
    @InjectRepository(ProblemRepository)
    private readonly problemRepository: ProblemRepository,
  ) {}

  /** to create a new problem entry in databases based on data provided by [[CreateProblemDto]]  */
  create(createProblemDto: CreateProblemDto) {
    return this.problemRepository.save(createProblemDto);
  }

  /** to return list of all problems */
  findAll() {
    return this.problemRepository.find();
  }

  /**
   * to fetch details of a particular problem based on its uuid. Internally this calls the
   * [[findAndFilter]] method of [[ProblemRepository]] to hide sensitive details of the problem
   */
  async findOne(id: string) {
    try {
      const problem = await this.problemRepository.findAndFilter(id);
      return problem;
    } catch (e) {
      throw new NotFoundException(`Invalid QuestionID :${id}`);
    }
  }

  /**
   * to fetch details of a particular problem to judge the submission. This is different from
   * [[findAndFilter]] as this returns inputText and outputText as well, and does not include
   * download links.
   */
  async findOneForJudge(id: string) {
    try {
      const problem = await this.problemRepository.findOneForJudge(id);
      return problem;
    } catch (e) {
      throw new BadRequestException(`Invalid QuestionID :${id}`);
    }
  }

  /** to delete a problem by uuid */
  remove(id: string) {
    return this.problemRepository.delete({ id });
  }

  /** critical function, to clear/delete/remove all problems in storage */
  clear() {
    return this.problemRepository.delete({ maxPoints: MoreThanOrEqual(0) });
  }
}
