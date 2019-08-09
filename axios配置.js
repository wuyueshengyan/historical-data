const router = [{
    path: '/',
    name: '/',
    component: Index
}, {
    path: '/repository',
    name: 'repository',
    meta: {
        requireAuth: true, //添加该字段，表示进入这个路由是需要登录的
    },
    component: Repository
}]

//定义完路由后，我们主要是利用vue-router提供的钩子函数beforeEach()对路由进行判断

router.beforeEach((to, from, next) => {
    if (to.meta.requireAuth) {
        // 判断该路由是否需要登录权限
        if (store.state.token) {
            // 通过vuex state 获取当前的token是否存在
            next()
        } else {
            next({
                path: '/login',
                //将跳转的路由path作为参数，登录成功之后跳转到该路由
                query: { redirect: to.fullPath }
            })
        }
    } else {
        next()
    }
})

/**  每个钩子方法接收三个参数
 to：Route ： 即将要进入的目标 路由对象
 from：Route ： 当前导航正要离开的路由
 next:Function: 一定要调用该方法来resolve这个钩子.执行效果依赖next方法的调用参数
 next():进行管道中的下一个钩子。如果全部钩子执行完了，则导航状态就是confirmed(确定)
 next(false)：中断当前的导航。如果浏览器的URL改变了(可能是用户手动或者浏览器后退按钮)，那么》URL地址重置到from路由对应的地址。
 next(‘/’) 或者 next({ path: ‘/’ }): 跳转到一个不同的地址。当前的导航被中断，然后进行一个新的导航。

 确保要调用 next 方法，否则钩子就不会被 resolved。

 其中，to.meta中是我们自定义的数据，其中就包括我们刚刚定义的requireAuth字段。通过这个字段来判断>该路由是否需要登录权限。需要的话，同时当前应用不存在token，则跳转到登录页面，进行登录。登录成功>后跳转到目标路由

但是这种方式只是简单的前端路由控制,并不能真正的阻止用户访问需要登录的权限路由。还有一种情况是：当前的token失效了，但是token依然保存在本地。这个时候你去访问登录权限的路由时，实际上让客户重新登录

这个时候需要结合http拦截器+后端接口返回的http状态码来判断



 */

//  第二步：拦截器想要统一处理所有http请求和响应，就得用上axios的拦截器。通过配置http response interceptor，当后端接口返回401 未授权的时候，让用户重新登录。

// http request 拦截器
axios.interceptors.request.use(
    config => {
        // 判断是否存在token，如果存在的话，则每个http headers 都加上token
        if (store.state.token) {
            config.headers.Authorization = `token ${store.state.token}`;
        }

        return config;
    },

    err => {
        return Promise.reject(err);
    }
)

// http Response 拦截器
axios.interceptors.response.use(
    response => {
        return response;
    },

    error => {
        if (error.response) {
            switch (error.response.status) {
                case 401:
                    //返回401 清除token信息并跳转到登录页面
                    // 调用mutation方法对store的属性进行操作
                    store.commit(types.LoGOUT);
                    router.replace({
                        path: 'login',
                        query: { redirect: router.currentRoute.fullPath }
                    })
            }
        }
        return Promise.reject(error.response.data) //返回接口返回的错误消息
    }
)





// http拦截
/** 
 * 首先我们要明白设置拦截器的目的是什么，当我们需要统一处理http请求和响应时，我们通过设置拦截器处理会方便很多
 * 
 * 这个项目我引入了element ui 框架，使用结合了element中的loading和message组件处理
 */


/**
 * http配置
 */
// 引入axios以及element ui中的loading和message组件
import axios from 'axios'
import { Loading, Message } from 'element-ui'
// 超时时间
axios.defaults.timeout = 5000

// http请求拦截器

// 这里定义一个变量接收loading的调用方法，方便后面的关闭
var loadinginstace
axios.interceptors.request.use(config => {
        // element ui Loading方法
        loadinginstace = Loading.service({ fullscreen: true })
        return config
    }, error => {
        loadinginstace.close()
        Message.error({
            message: '加载超时'
        })
        return Promise.reject(error)
    })
    // http响应拦截器
axios.interceptors.response.use(data => {
    // 响应成功关闭loading
    loadinginstace.close()
    return data
}, error => {
    loadinginstace.close()
    Message.error({
        message: '加载失败'
    })
    return Promise.reject(error)
})

export default axios
// 这样我们就统一处理了http请求和响应的拦截.当然我们可以根据具体的业务要求更改拦截中的处理.



/**  补充一个最全的axios的配置 增加了get和post的方法的封装，因为post方法传参总是需要用qs来序列化请求参数
 *  */

// 请求超时时间
axios.defaults.timeout = 10000;

// post请求头
axios.defaults.headers.post['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8';

// 请求拦截器
axios.interceptors.request.use(
    config => {
        // 每次发送请求之前判断是否存在token，如果存在，则统一在http请求的header都加上token，不用每次请求都手动添加了
        // 即使本地存在token，也有可能token是过期的，所以在响应拦截器中要对返回状态进行判断
        const token = store.state.token;
        token && (config.headers.Authorization = token);
        return config;
    },
    error => {
        return Promise.error(error);
    })

// 响应拦截器
axios.interceptors.response.use(
    response => {
        if (response.status === 200) {
            return Promise.resolve(response);
        } else {
            return Promise.reject(response);
        }
    },
    // 服务器状态码不是200的情况    
    error => {
        if (error.response.status) {
            switch (error.response.status) {
                // 401: 未登录                
                // 未登录则跳转登录页面，并携带当前页面的路径                
                // 在登录成功后返回当前页面，这一步需要在登录页操作。                
                case 401:
                    router.replace({
                        path: '/login',
                        query: { redirect: router.currentRoute.fullPath }
                    });
                    break;
                    // 403 token过期                
                    // 登录过期对用户进行提示                
                    // 清除本地token和清空vuex中token对象                
                    // 跳转登录页面                
                case 403:
                    Toast({
                        message: '登录过期，请重新登录',
                        duration: 1000,
                        forbidClick: true
                    });
                    // 清除token                    
                    localStorage.removeItem('token');
                    store.commit('loginSuccess', null);
                    // 跳转登录页面，并将要浏览的页面fullPath传过去，登录成功后跳转需要访问的页面
                    setTimeout(() => {
                        router.replace({
                            path: '/login',
                            query: {
                                redirect: router.currentRoute.fullPath
                            }
                        });
                    }, 1000);
                    break;
                    // 404请求不存在                
                case 404:
                    Toast({
                        message: '网络请求不存在',
                        duration: 1500,
                        forbidClick: true
                    });
                    break;
                    // 其他错误，直接抛出错误提示                
                default:
                    Toast({
                        message: error.response.data.message,
                        duration: 1500,
                        forbidClick: true
                    });
            }
            return Promise.reject(error.response);
        }
    }
);
/** 
 * get方法，对应get请求 
 * @param {String} url [请求的url地址] 
 * @param {Object} params [请求时携带的参数] 
 */
export const get = (url, ...params) => {
        return new Promise((resolve, reject) => {
            axios.get(url, {
                    params: params
                })
                .then(res => {
                    resolve(res.data);
                })
                .catch(err => {
                    reject(err.data)
                })
        });
    }
    /** 
     * post方法，对应post请求 
     * @param {String} url [请求的url地址] 
     * @param {Object} params [请求时携带的参数] 
     */
export const post = (url, ...params) => {
    return new Promise((resolve, reject) => {
        axios.post(url, QS.stringify(...params))
            .then(res => {
                resolve(res.data);
            })
            .catch(err => {
                reject(err.data)
            })
    });
}