var CronJob = require('cron').CronJob;
const fs = require('fs');
const request = require('request');
const log = require('electron-log');

var EventEmitter = require('events').EventEmitter; 
var event = new EventEmitter(); 
module.exports.event=event;

//任务配置文件
const JobFilePath='./resources/jobs';
//日志目录
const JobLogFilePath='./resources/joblogs';

global.JobTable=new HashTable();

// var param={
//     id: i, 
//     name: '任务名称', 
//     totalCount: 5,
//     execCount: 0, 
//     devices: deviceList, 
//     code: 'code', 
//     args: args, 
//     cron: '*/20 * * * * *',
//     runOnInit:true,
//     startTime: '00:00:00',
//     endTime: '23:59:59',
//     jobBeginTime: '2019-07-31 10:20:00',
//     jobEndTime: '2020-07-31 10:20:00',
//     interval: 30,
//     lastExecTime: '2019-07-31 10:25:00'  //上次执行时间
//   };


module.exports.CreateJob=function(param){
    try{
        initDir();
        //校验参数
        

        if(global.JobTable.containsKey(param.id)){
            return '任务id重复';
        }

        var cronJob=new CronJob(param.cron,function(){
            exec(param.id);
        },null,param.runOnInit);

        var joblog=generateLogStr('任务创建成功');

        var job = {
            id: param.id,
            name: param.name,
            totalCount: param.totalCount,
            execCount: 0,
            devices: param.devices,
            code: param.code,
            args: param.args,
            cron: param.cron,
            runOnInit: param.runOnInit,
            cronJob: cronJob,
            sleepTime: param.sleepTime,
            jobBeginTime: param.jobBeginTime,
            jobEndTime: param.jobEndTime,
            interval: param.interval,
            lastExecTime: null,  //上次执行时间
            joblog: joblog,
            finished: false
        };
        global.JobTable.add(param.id,job);
        //同步到文件
        syncJobFile(param.id);
        addJobLog(param.id,joblog);
        return '';
    }catch(e){
        log.error('创建任务失败：'+e.message);
        return '创建任务失败';
    }

};

module.exports.DeleteJob=function(id){
    try{
        var job=global.JobTable.getValue(id);
        if(job!=null){
            var cronJob=job.cronJob;
            if(cronJob!=null){
                cronJob.stop();          
            }       
        }
        global.JobTable.remove(id);
        //同步到文件，删除
        var path=JobFilePath+'\\'+'job-'+id;
        fs.unlinkSync(path);
        var joblog=generateLogStr('删除任务')
        addJobLog(id,joblog);
    }catch(e){
        log.error('删除任务失败：'+e.message);
        return '删除任务失败';
    }
    
};

module.exports.StartJob=function(id){
    try{
        var job=global.JobTable.getValue(id);
        if(job!=null){
            if(job.finished){
                return '任务已停止';
            }
            if(job.execCount>=job.totalCount){
                return '任务已执行完毕';
            }
            var cronJob=job.cronJob;
            if(cronJob!=null){
                if(!cronJob.running){
                    cronJob.start();
                    var joblog=generateLogStr('开始任务');
                    job.runOnInit=true;
                    job.joblog=joblog;
                    //同步到文件
                    syncJobFile(id);
                    addJobLog(id,joblog);
                }       
            }       
        }
    }catch(e){
        log.error('开始任务失败：'+e.message);
        return '开始任务失败';
    }
};

//暂停任务
module.exports.StopJob=function(id){
    try{
        var job=global.JobTable.getValue(id);
        if(job!=null){
            if(job.finished){
                return '任务已经是停止状态';
            }
            var cronJob=job.cronJob;
            if(cronJob!=null){
                cronJob.stop(); 
                var joblog=generateLogStr('暂停任务');   
                job.runOnInit=false;
                job.joblog=joblog;
                //同步到文件
                syncJobFile(id);  
                addJobLog(id,joblog);    
            }       
        }
    }catch(e){
        log.error('停止任务失败：'+e.message);
        return '停止任务失败';
    }
};

//停止任务
module.exports.FinishJob=function(id){
    try{
        var job=global.JobTable.getValue(id);
        if(job!=null){
            if(job.finished){
                return '任务已经是停止状态';
            }
            var cronJob=job.cronJob;
            if(cronJob!=null){
                cronJob.stop(); 
                var joblog=generateLogStr('停止任务');   
                job.runOnInit=false;
                job.joblog=joblog;
                job.finished=true;
                //同步到文件
                syncJobFile(id);  
                addJobLog(id,joblog);    
            }       
        }
    }catch(e){
        log.error('停止任务失败：'+e.message);
        return '停止任务失败';
    }
};


module.exports.GetJob=function(id){
    return global.JobTable.getValue(id);
};

module.exports.GetCount=function(){
    return global.JobTable.getSize();
};

//module.exports.GetAllJobs=function(){
//    return global.JobTable.getValues();
//};

//获取任务信息字段
module.exports.GetAllJobs = function () {
    var result = [];
    global.JobTable.getValues().forEach((item, index, array) => {
        let jobStatus = '';
        let now = new Date();
        let beginTime = new Date(item.jobBeginTime.replace(/-/g, "/"));
        if (beginTime > now) {
            jobStatus = '未开始';
        }
        if (jobStatus == '') {
            if (item.finished) {
                jobStatus = '已结束';
            } else {
                if (!item.cronJob.running) {
                    jobStatus = '暂停';
                } else {
                    jobStatus = '进行中';
                }
            }
        }
        let job = { 
            id: item.id, 
            name: item.name, 
            cron: item.cron,
            jobBeginTime: item.jobBeginTime, 
            jobEndTime: item.jobEndTime, 
            execCount: item.execCount, 
            totalCount: item.totalCount,
            devices: item.devices,
            jobStatus: jobStatus,
            joblog: item.joblog            
        };
        result.push(job);
    })
    return result;
}

//清空所有任务
module.exports.Clear = function () {
    try {
        global.JobTable.getValues().forEach((item, index, array) => {
            if (item.cronJob != null) {
                item.cronJob.stop();
            }
        });
        global.JobTable.clear();
        var jobFiles = fs.readdirSync(JobFilePath);
        if (jobFiles != null) {
            jobFiles.forEach((item, index, array) => {
                fs.unlinkSync(JobFilePath + '\\' + item);
            });
        }
    } catch (e) {
        log.error('清空任务失败：' + e.message);
        return '清空任务失败';
    }
}

function sleep1(numberMillis) {
    var now = new Date();
    var exitTime = now.getTime() + numberMillis;
    while (true) {
    now = new Date();
    if (now.getTime() > exitTime)
    return;
    }
    }

var sleep = function (delay) {
    return new Promise((resolve, reject) => { 
     setTimeout(() => { 
       try {
        resolve(1)
       } catch (e) {
        reject(0)
       }
     }, delay);
    })
   }

//从本地配置文件初始化任务，程序启动时执行
module.exports.InitJob=function(){
    initDir();
    var jobFiles=fs.readdirSync(JobFilePath);
    if(jobFiles!=null){
        jobFiles.forEach((item,index,array)=>{
            let tempPath=JobFilePath+'/'+item;
            let data = fs.readFileSync(tempPath);
            if(data.length<=0){
                return;
            };
            try{
                var j = JSON.parse(data.toString());//将字符串转换为json对象
                if(j!=null){
                    let cronJob=new CronJob(j.cron,function(){
                        exec(j.id);
                    },null,j.runOnInit);
                    let job = {
                        id: j.id,
                        name: j.name,
                        totalCount: j.totalCount,
                        execCount: j.execCount,
                        devices: j.devices,
                        code: j.code,
                        args: j.args,
                        cron: j.cron,
                        runOnInit: j.runOnInit,
                        cronJob: cronJob,
                        sleepTime: j.sleepTime,
                        jobBeginTime: j.jobBeginTime,
                        jobEndTime: j.jobEndTime,
                        interval: j.interval,
                        lastExecTime: j.lastExecTime,  //上次执行时间
                        joblog: j.joblog,
                        finished: j.finished
                    };
                    global.JobTable.add(j.id,job);
                }
            }catch(e){
                log.error('加载任务失败,任务id：'+id);
            }
        });
    };
}

//每分钟触发任务，但不一定真正执行作业，取决于配置
var exec = function (id) {
    try {
        //根据传递的id取参数
        var params = global.JobTable.getValue(id);
        if (params == null) {
            log.error('数据异常');
            return;
        }

        if (params.finished) {
            return;
        }

        //校验当前是否符合规则
        let now = new Date();
        if (params.jobBeginTime != null && params.jobBeginTime != '') {
            let beginTime = new Date(params.jobBeginTime.replace(/-/g, "/"));
            if (beginTime > now) {
                return;
            }
        };
        if (params.jobEndTime != null && params.jobEndTime != '') {
            let endTime = new Date(params.jobEndTime.replace(/-/g, "/"));
            if (endTime < now) {
                return;
            }
        };

        var today = new Date().Format('yyyy-MM-dd');
        if (params.sleepTime != null) {
            for (let i = 0; i < params.sleepTime.length; i++) {
                let sleepBegin = new Date(today + ' ' + params.sleepTime[i].startTime);
                let sleepEnd = new Date(today + ' ' + params.sleepTime[i].endTime);
                if (now > sleepBegin && now < sleepEnd) {
                    return;
                };
            }
        }

        if (params.lastExecTime != null && params.lastExecTime != '') {
            let temp = new Date(params.lastExecTime.replace(/-/g, "/"));
            if ((now.getTime() - temp.getTime()) < (params.interval * 60 * 1000) - 1000) {
                return;
            }
        };

        if (params.execCount >= params.totalCount) {
            params.cronJob.stop();
            params.runOnInit = false;
            params.finished = true;
            syncJobFile(id);
            return;
        }

        //生成运行参数
        var execArg = {};
        for (var prop in params.args) {
            var pv = params.args[prop];
            if (pv.execMode == 1) {
                if(pv.limitNum==0){
                    if(pv.execIndex<pv.values.length){
                        execArg[prop]=pv.values[pv.execIndex];
                        pv.execIndex++;
                        if(pv.execIndex>pv.values.length){
                            //任务结束
                            params.cronJob.stop();
                            params.runOnInit = false;
                            params.finished = true;
                            params.joblog = generateLogStr("任务执行结束(参数["+prop+"]无可用值)");
                            syncJobFile(id);
                            addJobLog(id, params.joblog);
                            event.emit('refreshJob');   //发出事件
                            return;
                        }
                    }
                }
                else{
                    let rdParamCount=randomNum(1,pv.limitNum);
                    let remainParamCount=pv.values.length-pv.execIndex;
                    let paramCount=Math.min(rdParamCount,remainParamCount);
                    execArg[prop]=pv.values.slice(pv.execIndex,pv.execIndex+paramCount);
                    pv.execIndex+=paramCount;
                    if(pv.execIndex>pv.values.length||paramCount<=0){
                        //任务结束
                        params.cronJob.stop();
                        params.runOnInit = false;
                        params.finished = true;
                        params.joblog = generateLogStr("任务执行结束(参数["+prop+"]无可用值)");
                        syncJobFile(id);
                        addJobLog(id, params.joblog);
                        event.emit('refreshJob');   //发出事件
                        return;
                    }
                }
            } else if (pv.execMode == 2) {
                if (pv.limitNum == 0) {
                    let rd = randomNum(0, pv.values.length - 1);
                    execArg[prop] = pv.values[rd];
                }
                else {
                    let paramCount=randomNum(1,pv.limitNum);
                    execArg[prop] = getRandomArrayElements(pv.values,paramCount);
                }
            }
        }

        params.devices.forEach((item, index, array) => {
            let options = {
                url: 'https://' + item.forword + '/engine/execute',
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "cache-type": "no-cache"
                },
                json: true,
                body: {
                    "session": "85348db6a46d8acf", //session_storage.getItem('xky_session'),
                    "sn": item.sn,
                    "args": execArg,
                    "code": params.code,
                    "sync": true,
                    "source": true,
                    "background": false
                }
            };
            //log.info(options);
            //执行
            //return;
            request.post(options, function (err, response, body) {
                log.info('执行回调');
            })
        });

        params.execCount++;

        var joblog = generateLogStr('正在执行第' + params.execCount + '条，参数' + JSON.stringify(execArg));
        addJobLog(id, joblog);
        if (params.execCount >= params.totalCount) {
            params.cronJob.stop();
            params.runOnInit = false;
            params.finished = true;
            joblog = generateLogStr("任务执行结束");
            setTimeout(function(){
                addJobLog(id, joblog);
            },5000);
        }

        log.info('正在执行任务：' + params.name + ';表达式：' + params.cron + ';总次数：' + params.totalCount + ';当前次数：' + params.execCount + ';执行日志：' + joblog);
        params.joblog = joblog;
        params.lastExecTime = new Date().Format("yyyy-MM-dd hh:mm:ss");
        //同步到文件
        syncJobFile(id);
        event.emit('refreshJob');   //发出事件

    } catch (e) {
        log.error('加载任务失败');
    }
}


function initDir(){
    //任务目录
    if(!fs.existsSync(JobFilePath)){
        fs.mkdirSync(JobFilePath);
    };
    //日志目录
    if(!fs.existsSync(JobLogFilePath)){
        fs.mkdirSync(JobLogFilePath);
    };
}


function syncJobFile(id){
    var jobData=global.JobTable.getValue(id);
    if(jobData!=null){
        let j={ 
            id: jobData.id, 
            name: jobData.name, 
            totalCount: jobData.totalCount, 
            execCount: jobData.execCount,
            devices: jobData.devices, 
            code: jobData.code, 
            args: jobData.args,
            cron: jobData.cron,
            runOnInit: jobData.runOnInit ,
            sleepTime: jobData.sleepTime,
            jobBeginTime: jobData.jobBeginTime,
            jobEndTime: jobData.jobEndTime,
            interval: jobData.interval,
            lastExecTime: jobData.lastExecTime,  //上次执行时间
            joblog: jobData.joblog,
            finished: jobData.finished
        };
        var str = JSON.stringify(j);//同步到文件
        var path=JobFilePath+'\\'+'job-'+id;
        //log.info('任务状态变更：'+str);
        fs.writeFile(path,str,function(err){
            if(err){
                log.error(err);
            }
        })
    };
}

//更新任务日志
function addJobLog(id, msg) {
    var path = JobLogFilePath + '\\' + 'job-' + id+".log";
    fs.appendFile(path, msg+'\r\n', function (err) {
        if (err) {
            log.error(err);
        }
    })
}

function generateLogStr(msg){
    var now=new Date().Format("yyyy-MM-dd hh:mm:ss");
    var joblog=now+' '+msg;
    return joblog;
}


function HashTable() {
    var size = 0;
    var entry = new Object();
    this.add = function (key, value) {
        if (!this.containsKey(key)) {
            size++;
        }
        entry[key] = value;
    }
    this.getValue = function (key) {
        return this.containsKey(key) ? entry[key] : null;
    }
    this.remove = function (key) {
        if (this.containsKey(key) && (delete entry[key])) {
            size--;
        }
    }
    this.containsKey = function (key) {
        return (key in entry);
    }
    this.containsValue = function (value) {
        for (var prop in entry) {
            if (entry[prop] == value) {
                return true;
            }
        }
        return false;
    }
    this.getValues = function () {
        var values = new Array();
        for (var prop in entry) {
            values.push(entry[prop]);
        }
        return values;
    }
    this.getKeys = function () {
        var keys = new Array();
        for (var prop in entry) {
            keys.push(prop);
        }
        return keys;
    }
    this.getSize = function () {
        return size;
    }
    this.clear = function () {
        size = 0;
        entry = new Object();
    }
}

//生成从minNum到maxNum的随机整数
function randomNum(minNum,maxNum){ 
    switch(arguments.length){ 
        case 1: 
            return parseInt(Math.random()*minNum+1,10); 
        break; 
        case 2: 
            return parseInt(Math.random()*(maxNum-minNum+1)+minNum,10); 
        break; 
            default: 
                return 0; 
            break; 
    } 
} 

function getRandomArrayElements(arr, count) {
    var shuffled = arr.slice(0), i = arr.length, min = i - count, temp, index;
    while (i-- > min) {
        index = Math.floor((i + 1) * Math.random());
        temp = shuffled[index];
        shuffled[index] = shuffled[i];
        shuffled[i] = temp;
    }
    return shuffled.slice(min);
}



// 对Date的扩展，将 Date 转化为指定格式的String   
// 月(M)、日(d)、小时(h)、分(m)、秒(s)、季度(q) 可以用 1-2 个占位符，   
// 年(y)可以用 1-4 个占位符，毫秒(S)只能用 1 个占位符(是 1-3 位的数字)   
// 例子：   
// (new Date()).Format("yyyy-MM-dd hh:mm:ss.S") ==> 2006-07-02 08:09:04.423   
// (new Date()).Format("yyyy-M-d h:m:s.S")      ==> 2006-7-2 8:9:4.18   
Date.prototype.Format = function(fmt)   
{ //author: meizz   
  var o = {   
    "M+" : this.getMonth()+1,                 //月份   
    "d+" : this.getDate(),                    //日   
    "h+" : this.getHours(),                   //小时   
    "m+" : this.getMinutes(),                 //分   
    "s+" : this.getSeconds(),                 //秒   
    "q+" : Math.floor((this.getMonth()+3)/3), //季度   
    "S"  : this.getMilliseconds()             //毫秒   
  };   
  if(/(y+)/.test(fmt))   
    fmt=fmt.replace(RegExp.$1, (this.getFullYear()+"").substr(4 - RegExp.$1.length));   
  for(var k in o)   
    if(new RegExp("("+ k +")").test(fmt))   
  fmt = fmt.replace(RegExp.$1, (RegExp.$1.length==1) ? (o[k]) : (("00"+ o[k]).substr((""+ o[k]).length)));   
  return fmt;   
}  


