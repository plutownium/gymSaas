import request from "supertest";
import TaskDAO from "../../src/database/dao/task.dao";
import { ProviderEnum } from "../../src/enum/provider.enum";
import { CityEnum } from "../../src/enum/city.enum";

import { app, server } from "../mocks/mockServer";
import { realResultsRentFaster } from "../mocks/realResults/rentFaster";
import { Task } from "../../src/database/models/Task";
import { smlCanada } from "../mocks/smallRealResults/smlCanada";
import { smlFaster } from "../mocks/smallRealResults/smlFaster";
import { smlSeeker } from "../mocks/smallRealResults/smlSeeker";

const taskDAO = new TaskDAO();

const testTasks = [
    {
        lat: 45.5019,
        long: -73.5674,
        index: 0,
    },
    {
        long: -73.66279309451045,
        lat: 45.54920096660751,
        index: 1,
    },
];
const testTasks2 = [
    {
        lat: 45.5019,
        long: -73.5674,
        index: 0,
    },
    {
        long: -73.66279309451045,
        lat: 45.54920096660751,
        index: 1,
    },
    {
        long: -73.56703009451044,
        lat: 45.54920096660751,
        index: 1,
    },
];

const testTasks3 = [
    {
        lat: 45.5019,
        long: -73.5674,
        index: 0,
    },
    {
        long: -73.66279309451045,
        lat: 45.54920096660751,
        index: 1,
    },
    {
        long: -73.7581861890209,
        lat: 45.596501933215016,
        index: 2,
    },
    {
        long: -73.7581861890309,
        lat: 45.596501933215316,
        index: 2,
    },
];

const miniPayloadRentCanada = {
    provider: ProviderEnum.rentCanada,
    city: CityEnum.montreal,
    coords: testTasks,
};
const miniPayloadRentFaster = {
    provider: ProviderEnum.rentFaster,
    city: CityEnum.montreal,
    coords: testTasks2,
};
const miniPayloadRentSeeker = {
    provider: ProviderEnum.rentSeeker,
    city: CityEnum.montreal,
    coords: testTasks3,
};

beforeAll(async () => {
    await app.connectDB();
});

beforeEach(async () => {
    await app.dropTable("task");
    await app.dropTable("housing");
});

afterAll(async () => {
    await app.dropTable("task");
    await app.dropTable("housing");
    await app.closeDB();
});

describe("test taskQueue controller", () => {
    let batchNum = 0;
    test("health check!", async () => {
        const healthCheckRes = await request(server).get("/task_queue/health_check");
        console.log(healthCheckRes.body, "103rm");
        expect(healthCheckRes.body.status).toBe("Online");
    });
    // test("retrieve queued tasks from the queue - works [integration]", async () => {
    //     // add some data so tests have sth to work with

    //     const x = await request(server).post("/task_queue/queue_grid_scan").send(miniPayloadRentCanada);
    //     const x2 = await request(server).post("/task_queue/queue_grid_scan").send(miniPayloadRentFaster);
    //     console.log(x.body, x2.body, "106rm");
    //     expect(x.body.queued.pass).toBe(miniPayloadRentCanada.coords.length); // not the real point of the test, but, sanity
    //     expect(x2.body.queued.pass).toBe(miniPayloadRentFaster.coords.length); // not the real point of the test, but, sanity
    //     const allTasksViaEndpoint = await request(server).get("/task_queue/all");
    //     console.log(allTasksViaEndpoint, "107rm");
    //     expect(allTasksViaEndpoint.body.all.length).toEqual(miniPayloadRentCanada.coords.length + miniPayloadRentFaster.coords.length);
    // });
    // test("add tasks to the task queue - works [integration]", async () => {
    //     // 2nd payload, another provider
    //     const miniPayloadRentFaster = {
    //         provider: ProviderEnum.rentFaster,
    //         city: CityEnum.montreal,
    //         coords: [
    //             {
    //                 lat: 45.5019,
    //                 long: -73.5674,
    //                 index: 0,
    //             },
    //             {
    //                 long: -73.66279309451045,
    //                 lat: 45.54920096660751,
    //                 index: 1,
    //             },
    //             {
    //                 long: -73.7581861890209,
    //                 lat: 45.596501933215016,
    //                 index: 2,
    //             },
    //         ],
    //     };
    //     const queuedScan2 = await request(server).post("/task_queue/queue_grid_scan").send(miniPayloadRentFaster);
    //     expect(queuedScan2.body.length).toBe(miniPayloadRentFaster.coords.length);
    //     batchNum = queuedScan2.body.batchNum; // use in a later test
    // });
    // test("we can retrieve tasks per provider - works [integration]", async () => {
    //     await request(server).post("/task_queue/queue_grid_scan").send(miniPayloadRentFaster);
    //     await request(server).post("/task_queue/queue_grid_scan").send(miniPayloadRentSeeker);
    //     expect(miniPayloadRentFaster.coords.length).not.toEqual(miniPayloadRentSeeker.coords.length); // testing inputs
    //     const payload = { provider: ProviderEnum.rentSeeker, batchNum: 0 };
    //     const allTasksFromEndpoint = await request(server).get("/task_queue/next_tasks_for_scraper").send(payload);
    //     expect(allTasksFromEndpoint.body.tasks.length).toEqual(miniPayloadRentSeeker.coords.length);
    //     const payload2 = { provider: ProviderEnum.rentFaster, batchNum: 0 };
    //     const allTasksFromEndpoint2 = await request(server).get("/task_queue/next_tasks_for_scraper").send(payload2);
    //     expect(allTasksFromEndpoint2.body.tasks.length).toEqual(miniPayloadRentFaster.coords.length);
    // });

    // describe("Marking complete works", () => {
    //     beforeAll(async () => {
    //         const tasks = await request(server).post("/task_queue/queue_grid_scan").send(miniPayloadRentCanada);
    //         const tasks2 = await request(server).post("/task_queue/queue_grid_scan").send(miniPayloadRentFaster);
    //         const tasks3 = await request(server).post("/task_queue/queue_grid_scan").send(miniPayloadRentSeeker);
    //     });
    //     test("report tasks' results into db and mark them complete - works for rentCanada [integration]", async () => {
    //         // speculative payload
    //         const payload = { provider: ProviderEnum.rentCanada };
    //         // get all tasks for rentCanada, mark them complete.
    //         const tasksResponse = await request(server).get("/task_queue/next_tasks_for_scraper").send(payload);
    //         console.log(tasksResponse.body, "199rm");
    //         expect(tasksResponse.body.tasks).toBeDefined();
    //         const findingsPayloads = tasksResponse.body.tasks.map((t: Task) => {
    //             return {
    //                 provider: ProviderEnum.rentCanada,
    //                 taskId: t.taskId,
    //                 apartments: smlCanada,
    //             };
    //         });
    //         const completedTasksResponse = await request(server).post("/task_queue/report_findings_and_mark_complete").send(findingsPayloads);
    //         // now all the ones for rentCanada should be marked complete
    //         expect(completedTasksResponse.body.markedComplete).toBe(true);
    //         expect(completedTasksResponse.body.successfullyLogged).toBe(findingsPayloads.apartments.length);
    //         expect(completedTasksResponse.body.taskId).toBe(findingsPayloads.taskId);
    //         // now verify that all tasks for this provider are completed.
    //         const allTasksForThisProvider = await request(server).get("/task_queue/all").send(payload);
    //         const areAllTasksCompleted = allTasksForThisProvider.body.all;
    //         console.log(areAllTasksCompleted, "171rm");
    //     });

    //     test("report tasks' results into db and mark them complete - works for rentFaster [integration]", async () => {
    //         // speculative payload
    //         const payload = { provider: ProviderEnum.rentFaster };
    //         const tasksResponse = await request(server).get("/task_queue/next_tasks_for_scraper").send(payload);
    //         console.log(tasksResponse.body, "199rm");
    //         expect(tasksResponse.body.tasks).toBeDefined();
    //         const findingsPayloads = tasksResponse.body.tasks.map((t: Task) => {
    //             return {
    //                 provider: ProviderEnum.rentFaster,
    //                 taskId: t.taskId,
    //                 apartments: smlFaster,
    //             };
    //         });
    //         const completedTasksResponse = await request(server).post("/task_queue/report_findings_and_mark_complete").send(findingsPayloads);
    //         expect(completedTasksResponse.body.markedComplete).toBe(true);
    //         expect(completedTasksResponse.body.successfullyLogged).toBe(findingsPayloads.apartments.length);
    //         expect(completedTasksResponse.body.taskId).toBe(findingsPayloads.taskId);
    //         // now verify that all tasks for this provider are completed.
    //         const allTasksForThisProvider = await request(server).get("/task_queue/all").send(payload);
    //         const areAllTasksCompleted = allTasksForThisProvider.body.all;
    //         console.log(areAllTasksCompleted, "171rm");
    //     });

    //     test("report tasks' results into db and mark them complete - works for rentSeeker [integration]", async () => {
    //         // speculative payload
    //         const payload = { provider: ProviderEnum.rentSeeker };
    //         const tasksResponse = await request(server).get("/task_queue/next_tasks_for_scraper").send(payload);
    //         console.log(tasksResponse.body, "199rm");
    //         expect(tasksResponse.body.tasks).toBeDefined();
    //         const findingsPayloads = tasksResponse.body.tasks.map((t: Task) => {
    //             return {
    //                 provider: ProviderEnum.rentSeeker,
    //                 taskId: t.taskId,
    //                 apartments: smlSeeker,
    //             };
    //         });
    //         const completedTasksResponse = await request(server).post("/task_queue/report_findings_and_mark_complete").send(findingsPayloads);
    //         expect(completedTasksResponse.body.markedComplete).toBe(true);
    //         expect(completedTasksResponse.body.successfullyLogged).toBe(findingsPayloads.apartments.length);
    //         expect(completedTasksResponse.body.taskId).toBe(findingsPayloads.taskId);
    //         // now verify that all tasks for this provider are completed.
    //         const allTasksForThisProvider = await request(server).get("/task_queue/all").send(payload);
    //         const areAllTasksCompleted = allTasksForThisProvider.body.all;
    //         console.log(areAllTasksCompleted, "171rm");
    //     });
    // });
});