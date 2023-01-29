import { Task } from "../database/models/Task";
import { SuccessFilterEnum } from "../enum/successFilter.enum";

export function applySuccessFilter(tasks: Task[], filter: SuccessFilterEnum) {
    if (filter === SuccessFilterEnum.all) return tasks;
    if (filter === SuccessFilterEnum.success) return tasks.filter((t: Task) => t.ignore === false || t.ignore === null);
    if (filter === SuccessFilterEnum.ignored) return tasks.filter((t: Task) => t.ignore);
    throw Error("Invalid filter type");
}
