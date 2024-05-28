import React from 'react'
import {Outlet} from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
//import Navbar from '../components/Navbar'

const MainLayout = () => {
  return (
    <>
      <Outlet />
      <ToastContainer />
    </>
  )
}

export default MainLayout
