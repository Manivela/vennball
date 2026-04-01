import React from "react";
import ReactDOM from "react-dom/client";
import {
  createRoutesFromElements,
  createBrowserRouter,
  RouterProvider,
  Route,
} from "react-router-dom";
import Login from "./components/Login";
import Game from "./components/Game";
import Presentation from "./components/Presentation";

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route>
      <Route path="/" element={<Login />} />
      <Route path="/local" element={<Game localMode />} />
      <Route path="/presentation" element={<Presentation />} />
      <Route path="/:roomId" element={<Game />} />
    </Route>
  )
);

ReactDOM.createRoot(document.getElementById("root")).render(
  <RouterProvider router={router} />
);
