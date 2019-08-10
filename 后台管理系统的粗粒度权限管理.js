/**
 * 前端的权限策略。依照我个人的了解。把权限分为两种
 * 1.前端记录所有的权限。用户登录后，后台返回角色，前端根据角色自行分配页面
 * 2.前端仅记录页面，后端记录权限。用户登录后，后端返回用户权限列表，前端根据列表生成可访问的页面
 * 
 * 个人推荐第二种，维护成本低
 */

//  接口权限控制，其实就是对用户的校验。利用axios拦截，本存储库里有详细介绍。这边写一个大概：
const service = axios.create()

// http request 拦截器
// 每次请求都为http头增加Authorization字段，其内容为token
service.interceptors.request.use(
    config => {
        config.headers.Authorization = `${token}`
        return config
    }
);
export default service

/**
 * 页面级访问权限控制，在实际中有两种不同的情况
 * 1.显示系统中所有菜单，当用户访问不在自己权限范围内的页面时提示权限不足。
 * 2.只显示当前用户能访问的菜单，如果用户通过URL进行强制访问，则会直接404。
 * 个人推荐第二种，用户体验好，
 * 
 */


// store/index.js
import Axios from 'axios'
import Vue from 'vue'
import Vuex from 'vuex'

Vue.use(Vuex);
const axios = Axios.create();

const state = {
    mode: 'login',
    list: []
};

const getters = {};

const mutations = {
    setMode: (state, data) => {
        state.mode = data
    },
    setList: (state, data) => {
        state.list = data
    }
};

const actions = {
    // 获取权限列表
    getPermission({ commit }) {
        return new Promise((resolve, reject) => {
            axios({
                url: '/privilege/queryPrivilege?id=' + sessionStorage.getItem('privId'),
                methods: 'get',
                headers: {
                    token: sessionStorage.getItem('token'),
                    name: sessionStorage.getItem('name')
                }
            }).then((res) => {
                // 存储权限列表
                commit('setList', res.data.cust.privileges[0].children);
                resolve(res.data.cust.privileges[0].children)
            }).catch(() => {
                reject()
            })
        })
    }
};

export default new Vuex.Store({
    state,
    mutations,
    actions,
    getters
})

/**
 * 好了，我们现在请求后台拿到了权限数据，并将数据存放到了vuex中，下面我们需要利用返回数据匹配之前写的异步路由表，将匹配结果和静态路由表结合，开成最终的实际路由表。
 其中最关键的是利用vue-router2.2.0版本新添加的一个addRoutes方法，
 */


// router/index.js
/**
 * 根据权限匹配路由
 * @param {array} permission 权限列表（菜单列表）
 * @param {array} asyncRouter 异步路由对象
 */
function routerMatch(permission, asyncRouter) {
    return new Promise((resolve) => {
        const routers = [];
        // 创建路由
        function createRouter(permission) {
            // 根据路径匹配到的router对象添加到routers中即可
            permission.forEach((item) => {
                if (item.children && item.children.length) {
                    createRouter(item.children)
                }
                let path = item.path;
                // 循环异步路由，将符合权限列表的路由加入到routers中
                asyncRouter.find((s) => {
                    if (s.path === '') {
                        s.children.find((y) => {
                            if (y.path === path) {
                                y.meta.permission = item.permission;
                                routers.push(s);
                            }
                        })
                    }
                    if (s.path === path) {
                        s.meta.permission = item.permission;
                        routers.push(s);
                    }
                })
            })
        }

        createRouter(permission)
        resolve([routers])
    })
}

// 最后我们编写一个导航钩子实现用户页面逻辑

// router/index.js
router.beforeEach((to, form, next) => {
    if (sessionStorage.getItem('token')) {
        if (to.path === '/') {
            router.replace('/index')
        } else {
            console.log(store.state.list.length);
            if (store.state.list.length === 0) {
                //如果没有权限列表，将重新向后台请求一次
                store.dispatch('getPermission').then(res => {
                    //调用权限匹配的方法
                    routerMatch(res, asyncRouterMap).then(res => {
                        //将匹配出来的权限列表进行addRoutes
                        router.addRoutes(res[0]);
                        next(to.path)
                    })
                }).catch(() => {
                    router.replace('/')
                })
            } else {
                if (to.matched.length) {
                    next()
                } else {
                    router.replace('/')
                }
            }
        }
    } else {
        if (whiteList.indexOf(to.path) >= 0) {
            next()
        } else {
            router.replace('/')
        }
    }
});


/**
 * 细粒度数据操作权限
 * 我们在定义路由的时候，会多出来一个元字段，把返回的数据直接放到对应路由的meta字段中
 */
export const asyncRouterMap = [{
    path: '/resource',
    name: 'nav.Resource',
    meta: {
        permission: []
    },
    component: (resolve) => require(['@/components/Resource/resource'], resolve)
}]

// 把返回的数据直接放到对应路由的meta字段中

asyncRouter.find((s) => {
    if (s.path === '') {
        s.children.find((y) => {
            if (y.path === path) {
                //赋值
                y.meta.permission = item.permission;
                routers.push(s);
            }
        })
    }
    if (s.path === path) {
        s.meta.permission = item.permission;
        routers.push(s);
    }
})

// 这里我们期望的用法
// 如果它有outport权限则显示
//<el-button v-hasPermission="'outport'">导出</el-button>

// 所以我们注册一个全局自定义指令

//main.js
//按扭权限指令
Vue.directive('hasPermission', {
    inserted: (el, binding, vnode) => {
        let permissionList = vnode.context.$route.meta.permission;
        if (!permissionList.includes(binding.value)) {
            el.parentNode.removeChild(el)
        }
    }
})