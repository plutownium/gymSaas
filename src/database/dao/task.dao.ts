import { EagerLoadingError, Op } from "sequelize";
import moment from "moment";
//
import { ProviderEnum, ProviderEnumOrAll } from "../../enum/provider.enum";
import { Task, TaskCreationAttributes } from "../models/Task";
import { TryCatchClassDecorator } from "../../util/tryCatchClassDecorator";
import { Batch } from "../models/Batch";

@TryCatchClassDecorator(EagerLoadingError, (err, context) => {
    console.log(context, err);
    throw err;
})
class TaskDAO {
    constructor() {}

    public async createTask(task: TaskCreationAttributes) {
        return await Task.create(task);
    }

    public async getMultipleTasks(limit: number, offset?: number): Promise<{ rows: Task[]; count: number }> {
        return await Task.findAndCountAll({ offset, limit });
    }

    public async getTaskById(id: number) {
        return await Task.findByPk(id);
    }

    public async getHighestBatchNum() {
        return await Task.findOne({ order: [["batchId", "DESC"]] });
    }

    public async getMostRecentTaskForProvider(provider: ProviderEnum, batchNum?: number) {
        let conditions;
        if (batchNum) {
            conditions = { providerName: provider, batchId: batchNum };
        } else {
            conditions = { providerName: provider };
        }
        return await Task.findAll({
            limit: 1,
            where: conditions,
            order: [["createdAt", "DESC"]],
        });
    }

    public async getTasksByBatchNum(batchNum: number): Promise<Task[]> {
        return await Task.findAll({ where: { batchId: batchNum } });
    }

    public async getTasksByBatchNumAndCityId(batchNum: number, cityId: number): Promise<Task[]> {
        return await Task.findAll({ where: { batchId: batchNum, cityId } });
    }

    public async getTasksByBatchNumAndProvider(batchNum: number, providerName: string): Promise<Task[]> {
        return await Task.findAll({ where: { batchId: batchNum, providerName } });
    }

    public async getTasksByBatchNumAndCityIdAndProvider(batchNum: number, cityId: number, provider: ProviderEnumOrAll): Promise<Task[]> {
        // it looks like "all" could be passed but ideally it never gets here
        if (provider === ProviderEnumOrAll.all) {
            throw Error("Unintentional usage");
        }
        return await Task.findAll({ where: { batchId: batchNum, cityId, providerName: provider } });
    }

    // Can't work because it doesn't allow create with associations.
    // public async async  bulkCreateTask = (tasks: TaskCreationAttributes[]) {
    //     return Task.bulkCreate(tasks);
    // };

    public async getNextUnfinishedTaskForProvider(provider: ProviderEnum, batchNum?: number) {
        let conditions;
        if (batchNum) {
            conditions = { providerName: provider, batchId: batchNum };
        } else {
            conditions = { providerName: provider };
        }
        return await Task.findAll({
            limit: 1,
            where: conditions,
            order: [["createdAt", "DESC"]],
        });
    }

    public async getAllUnfinishedTasksForProvider(provider: ProviderEnum, batchNum?: number) {
        let conditions;
        if (batchNum) {
            conditions = { providerName: provider, lastScan: null, batchId: batchNum, ignore: false };
        } else {
            conditions = { providerName: provider, lastScan: null, ignore: false };
        }
        return await Task.findAll({
            where: conditions,
            order: [["createdAt", "DESC"]],
        });
    }

    public async getAllTasks(providerName?: ProviderEnum, batchId?: number, cityId?: number) {
        // even finished ones.
        let conditions;
        if (providerName && batchId && cityId) {
            conditions = { providerName, batchId, cityId };
        } else if (providerName && batchId) {
            conditions = { providerName, batchId };
        } else if (batchId && cityId) {
            conditions = { batchId, cityId };
        } else if (providerName && cityId) {
            conditions = { providerName, cityId };
        } else if (providerName) {
            conditions = { providerName };
        } else if (batchId) {
            conditions = { batchId };
        } else if (cityId) {
            conditions = { cityId };
        } else {
            conditions = {};
        }
        return await Task.findAll({ where: conditions });
    }

    public async getScorecard(providerName: ProviderEnum, batchNum: number) {
        return await Task.findAll({ where: { providerName }, include: { model: Batch, where: { batchId: batchNum } } });
    }

    // **
    // ** update section
    public async updateTask(task: TaskCreationAttributes, id: number) {
        return await Task.update(task, { where: { taskId: id } });
    }

    public async updateLastScanDate(task: Task, scanDate: Date): Promise<void> {
        task.lastScan = scanDate;
        await task.save();
    }

    public async markIgnored(task: Task): Promise<void> {
        // for when the scraper scans a place and gets 0 to 5 results
        task.ignore = true;
        await task.save();
    }

    public async deleteTask(taskId: number) {
        return await Task.destroy({ where: { taskId } });
    }

    public async deleteAll() {
        return await Task.destroy({ where: {} });
    }

    public async deleteTasksOlderThanTwoMonths() {
        return await Task.destroy({
            where: {
                createdAt: { [Op.lte]: moment().subtract(2, "months").toDate() },
            },
        });
    }
}

export default TaskDAO;
